import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getUserRoles, mergeLegacyRoles } from "@/lib/user-roles";
import { query } from "@/lib/db";

async function getSessionProvider(email?: string) {
  try {
    const session: any = await auth();
    if (session?.user?.authProvider) return session.user.authProvider;
  } catch {}

  try {
    const jar = await cookies();
    const token = jar.get("next-auth.session-token")?.value || jar.get("__Secure-next-auth.session-token")?.value;
    if (!token) return null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "";
    if (!secret) return null;
    const decoded: any = jwt.verify(token, secret);
    if (decoded?.authProvider) return decoded.authProvider;
    if (decoded?.provider) return decoded.provider;
  } catch {}

  if (email?.endsWith("@line.oauth")) return "line";
  return null;
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await query(
      `SELECT id, email, display_name, role, is_admin, password_hash IS NOT NULL AS has_password
       FROM slip_processing.web_users
       WHERE id = $1 AND deleted_at IS NULL`,
      [user.id]
    );

    const dbUser = result.rows[0];
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const authProvider = await getSessionProvider(dbUser.email);
    const hasPassword = Boolean(dbUser.has_password);
    const roles = mergeLegacyRoles(await getUserRoles(dbUser.id), dbUser.role, Boolean(dbUser.is_admin || user.isAdmin));
    const isAdmin = roles.includes("admin");
    const canChangePassword = authProvider === "credentials" || (!authProvider && hasPassword && !dbUser.email?.endsWith("@line.oauth"));

    return NextResponse.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.display_name || user.name || dbUser.email,
        role: dbUser.role || "resident",
        roles,
        isAdmin,
        authProvider: authProvider || null,
        hasPassword,
        canChangePassword,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load current user" }, { status: 500 });
  }
}
