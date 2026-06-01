import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const PUBLIC_ORIGIN = "https://suan-ake.cloud";

function publicUrl(path: string) {
  return new URL(path, PUBLIC_ORIGIN);
}

function safeRedirect(path: string | null) {
  if (!path) return "/dashboard";
  if (path.startsWith("/")) return path;
  try {
    const url = new URL(path);
    if (url.origin === PUBLIC_ORIGIN) return `${url.pathname}${url.search}`;
  } catch {}
  return "/dashboard";
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const error = req.nextUrl.searchParams.get("error");
    const storedState = req.cookies.get("line_oauth_state")?.value;

    if (error) {
      console.error("LINE callback failed from LINE", { error });
      return NextResponse.redirect(publicUrl(`/login?error=line_${encodeURIComponent(error)}`));
    }

    if (!code) {
      console.error("LINE callback missing code");
      return NextResponse.redirect(publicUrl("/login?error=line_missing_code"));
    }

    if (!state || !storedState || state !== storedState) {
      console.error("LINE callback state mismatch", {
        hasState: Boolean(state),
        hasStoredState: Boolean(storedState),
        match: state === storedState,
      });
      return NextResponse.redirect(publicUrl("/login?error=line_state"));
    }

    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "https://suan-ake.cloud/api/auth/callback/line",
        client_id: process.env.LINE_CLIENT_ID || "",
        client_secret: process.env.LINE_CLIENT_SECRET || "",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("LINE token exchange failed", {
        status: tokenRes.status,
        error: tokenData?.error,
        description: tokenData?.error_description,
      });
      return NextResponse.redirect(publicUrl("/login?error=line_token"));
    }

    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    if (!profileRes.ok || !profile.userId) {
      console.error("LINE profile fetch failed", { status: profileRes.status, hasUserId: Boolean(profile?.userId) });
      return NextResponse.redirect(publicUrl("/login?error=line_profile"));
    }

    const lineUserId: string = profile.userId;
    const displayName: string = profile.displayName || "LINE User";
    const avatarUrl: string | null = profile.pictureUrl || null;
    const email = `${lineUserId}@line.oauth`;

    const existing = await query("SELECT * FROM slip_processing.web_users WHERE email = $1", [email]);
    let userId: string;
    if (existing.rows.length === 0) {
      userId = crypto.randomUUID();
      await query(
        "INSERT INTO slip_processing.web_users (id, email, display_name, avatar_url, role, preferred_language, created_at, last_login_at) VALUES ($1, $2, $3, $4, 'resident', 'th', NOW(), NOW())",
        [userId, email, displayName, avatarUrl]
      );
    } else {
      userId = existing.rows[0].id;
      await query(
        "UPDATE slip_processing.web_users SET last_login_at = NOW(), display_name = COALESCE($2, display_name), avatar_url = COALESCE($3, avatar_url) WHERE id = $1",
        [userId, displayName, avatarUrl]
      );
    }

    const oauthExists = await query(
      "SELECT id FROM slip_processing.oauth_accounts WHERE provider = 'line' AND (provider_user_id = $1 OR provider_account_id = $1)",
      [lineUserId]
    );
    if (oauthExists.rows.length === 0) {
      await query(
        "INSERT INTO slip_processing.oauth_accounts (id, user_id, provider, provider_user_id, provider_account_id, access_token, refresh_token, created_at) VALUES ($1, $2, 'line', $3, $4, $5, $6, NOW())",
        [crypto.randomUUID(), userId, lineUserId, lineUserId, tokenData.access_token, tokenData.refresh_token || null]
      );
    }

    const sessionToken = jwt.sign(
      { sub: userId, email, name: displayName, image: avatarUrl, role: "resident", preferredLang: "th" },
      process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "fallback",
      { expiresIn: "30d" }
    );

    const callbackUrl = safeRedirect(req.nextUrl.searchParams.get("callbackUrl"));
    console.log("LINE login success", { userId, redirect: callbackUrl });

    const response = NextResponse.redirect(publicUrl(callbackUrl));

    response.cookies.set("next-auth.session-token", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set("__Secure-next-auth.session-token", sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set("line_oauth_state", "", {
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err: any) {
    console.error("LINE callback unexpected error", { message: err?.message, name: err?.name });
    return NextResponse.redirect(publicUrl("/login?error=line_unexpected"));
  }
}
