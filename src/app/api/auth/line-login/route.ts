import { NextRequest } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/dashboard";
  const state = crypto.randomUUID();
  const redirectUri = "https://suan-ake.cloud/api/auth/callback/line";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    state,
    scope: "profile openid",
    bot_prompt: "normal",
  });

  const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;

  // Set state cookie and redirect via HTML (works reliably with Traefik)
  return new Response(
    `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${lineAuthUrl.replace(/"/g, '&quot;')}"></head><body>Redirecting to LINE...</body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `line_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
        "Cache-Control": "no-store",
      },
    }
  );
}
