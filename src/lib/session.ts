import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { auth } from "./auth";
import { query } from "./db";

export type AppUser = {
  id: string;
  email: string;
  name?: string;
  role?: string;
  isAdmin?: boolean;
  linkedUserId?: string | null;
};

export async function getCurrentUser(): Promise<AppUser | null> {
  try {
    const nextAuthSession: any = await auth();
    if (nextAuthSession?.user?.id) {
      const r = await query(
        "SELECT id, user_id, email, display_name, role, is_admin FROM slip_processing.web_users WHERE id = $1 AND deleted_at IS NULL",
        [nextAuthSession.user.id]
      );
      if (r.rows[0]) {
        const u = r.rows[0];
        return { id: u.id, email: u.email, name: u.display_name, role: u.role, isAdmin: Boolean(u.is_admin || u.role === "admin"), linkedUserId: u.user_id || null };
      }
      return {
        id: nextAuthSession.user.id,
        email: nextAuthSession.user.email || "",
        name: nextAuthSession.user.name || "",
        role: nextAuthSession.user.role || "resident",
        isAdmin: nextAuthSession.user.role === "admin",
      };
    }
  } catch {}

  try {
    const jar = await cookies();
    const token = jar.get("next-auth.session-token")?.value || jar.get("__Secure-next-auth.session-token")?.value;
    if (!token) return null;
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "";
    if (!secret) return null;
    const decoded: any = jwt.verify(token, secret);
    if (!decoded?.sub) return null;
    const r = await query(
      "SELECT id, user_id, email, display_name, role, is_admin FROM slip_processing.web_users WHERE id = $1 AND deleted_at IS NULL",
      [decoded.sub]
    );
    if (r.rows[0]) {
      const u = r.rows[0];
      return { id: u.id, email: u.email, name: u.display_name || decoded.name, role: u.role, isAdmin: Boolean(u.is_admin || u.role === "admin"), linkedUserId: u.user_id || null };
    }
    return { id: decoded.sub, email: decoded.email || "", name: decoded.name || "", role: decoded.role || "resident", isAdmin: decoded.role === "admin" };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    const err: any = new Error("Admin permission required");
    err.status = 403;
    throw err;
  }
  return user;
}
