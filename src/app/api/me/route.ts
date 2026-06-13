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
      `SELECT id, email, display_name, house_number, phone, role, is_admin, password_hash IS NOT NULL AS has_password
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
        displayName: dbUser.display_name || "",
        houseNumber: dbUser.house_number || "",
        phone: dbUser.phone || "",
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

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { displayName, houseNumber, phone } = await req.json();

    await query(
      `UPDATE slip_processing.web_users
       SET display_name = COALESCE($1, display_name),
           house_number = COALESCE($2, house_number),
           phone = COALESCE($3, phone),
           updated_at = NOW()
       WHERE id = $4 AND deleted_at IS NULL`,
      [
        displayName !== undefined ? displayName : null,
        houseNumber !== undefined ? houseNumber : null,
        phone !== undefined ? phone : null,
        user.id
      ]
    );

    return NextResponse.json({ success: true, message: "Profile updated successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update profile" }, { status: 500 });
  }
}
