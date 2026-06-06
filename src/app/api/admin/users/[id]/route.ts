import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import pool, { query } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { normalizeRole } from "@/lib/user-roles";

function uniqueRoles(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  return Array.from(new Set(raw.map((role) => normalizeRole(String(role))).filter(Boolean) as string[]));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json();
  const roles = uniqueRoles(body.roles ?? (body.role ? [body.role] : []));
  const nextRoles = roles.length > 0 ? roles : ["resident"];
  const isAdmin = nextRoles.includes("admin");
  const primaryRole = isAdmin ? "admin" : nextRoles.includes("accountant") ? "accountant" : nextRoles.includes("manager") ? "manager" : "resident";

  try {
    if (admin.id === id && !isAdmin) {
      return NextResponse.json({ error: "Admins cannot remove their own admin role" }, { status: 403 });
    }

    const availableRoles = await query(
      `SELECT id, role_code FROM slip_processing.roles WHERE deleted_at IS NULL AND role_code = ANY($1::text[])`,
      [nextRoles]
    );
    const roleByCode = new Map(availableRoles.rows.map((role: any) => [role.role_code, role.id]));
    const missing = nextRoles.filter((role) => !roleByCode.has(role));
    if (missing.length > 0) {
      return NextResponse.json({ error: `Invalid role: ${missing.join(", ")}` }, { status: 400 });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const userResult = await client.query(
        `UPDATE slip_processing.web_users
         SET role = $2,
             is_admin = $3,
             notification_enabled = $4,
             updated_at = NOW()
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING id, email, display_name, house_number, role, is_admin, notification_enabled`,
        [id, primaryRole, isAdmin, body.notification_enabled !== false]
      );
      if (userResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      await client.query(
        `UPDATE slip_processing.user_roles
         SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [id, admin.id]
      );

      for (const roleCode of nextRoles) {
        await client.query(
          `INSERT INTO slip_processing.user_roles (id, user_id, role_id, assigned_by, assigned_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())`,
          [crypto.randomUUID(), id, roleByCode.get(roleCode), admin.id]
        );
      }

      await client.query("COMMIT");
      return NextResponse.json({ success: true, user: { ...userResult.rows[0], roles: nextRoles } });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
