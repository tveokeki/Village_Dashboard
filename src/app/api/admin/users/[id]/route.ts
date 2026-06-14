import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import pool, { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { normalizeRole } from "@/lib/user-roles";

function uniqueRoles(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : [];
  return Array.from(new Set(raw.map((role) => normalizeRole(String(role))).filter(Boolean) as string[]));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminOrManager();
    const { id } = await params;
    const body = await req.json();

    const roles = admin.roles || [];
    const isAdminUser = roles.includes("admin") || admin.isAdmin;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Fetch the existing user first to get their current values
      const existingRes = await client.query(
        `SELECT * FROM slip_processing.web_users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id]
      );
      const existingUser = existingRes.rows[0];
      if (!existingUser) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const email = body.email !== undefined ? body.email : existingUser.email;
      const displayName = body.display_name !== undefined ? body.display_name : existingUser.display_name;
      const houseNumber = body.house_number !== undefined ? body.house_number : existingUser.house_number;
      const phone = body.phone !== undefined ? body.phone : existingUser.phone;
      const notificationEnabled = body.notification_enabled !== undefined ? (body.notification_enabled !== false) : existingUser.notification_enabled;

      // Build general user profile update SQL
      let updateSql = `
        UPDATE slip_processing.web_users
        SET email = $2,
            display_name = $3,
            house_number = $4,
            phone = $5,
            notification_enabled = $6,
            updated_at = NOW()
      `;
      const updateParams = [id, email, displayName, houseNumber, phone, notificationEnabled];

      // Only admins can change legacy role columns or user_roles mappings
      if (isAdminUser && body.roles) {
        const nextRoles = uniqueRoles(body.roles);
        const rolesToAssign = nextRoles.length > 0 ? nextRoles : ["resident"];
        const nextIsAdmin = rolesToAssign.includes("admin");
        const primaryRole = nextIsAdmin ? "admin" : "resident";

        if (admin.id === id && !nextIsAdmin) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Admins cannot remove their own admin role" }, { status: 403 });
        }

        const availableRoles = await client.query(
          `SELECT id, role_code FROM slip_processing.roles WHERE deleted_at IS NULL AND role_code = ANY($1::text[])`,
          [rolesToAssign]
        );
        const roleByCode = new Map(availableRoles.rows.map((role: any) => [role.role_code, role.id]));
        const missing = rolesToAssign.filter((role) => !roleByCode.has(role));
        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: `Invalid role: ${missing.join(", ")}` }, { status: 400 });
        }

        updateSql += `, role = $7, is_admin = $8`;
        updateParams.push(primaryRole, nextIsAdmin);

        updateSql += ` WHERE id = $1 AND deleted_at IS NULL RETURNING id, email, display_name, house_number, phone, role, is_admin, notification_enabled`;
        const userResult = await client.query(updateSql, updateParams);
        if (userResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Reassign roles in user_roles table
        await client.query(
          `UPDATE slip_processing.user_roles
           SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW()
           WHERE user_id = $1 AND deleted_at IS NULL`,
          [id, admin.id]
        );

        for (const roleCode of rolesToAssign) {
          await client.query(
            `INSERT INTO slip_processing.user_roles (id, user_id, role_id, assigned_by, assigned_at, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())`,
            [crypto.randomUUID(), id, roleByCode.get(roleCode), admin.id]
          );
        }

        await client.query("COMMIT");
        return NextResponse.json({ success: true, user: { ...userResult.rows[0], roles: rolesToAssign } });
      } else {
        // Manager path or no roles in body - only update profile columns
        updateSql += ` WHERE id = $1 AND deleted_at IS NULL RETURNING id, email, display_name, house_number, phone, role, is_admin, notification_enabled`;
        const userResult = await client.query(updateSql, updateParams);
        if (userResult.rowCount === 0) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        await client.query("COMMIT");

        // Fetch user's current roles from db since we didn't change them
        const rolesResult = await query(
          `SELECT r.role_code 
           FROM slip_processing.user_roles ur 
           JOIN slip_processing.roles r ON ur.role_id = r.id AND r.deleted_at IS NULL
           WHERE ur.user_id = $1 AND ur.deleted_at IS NULL`,
          [id]
        );
        const assignedRoleCodes = rolesResult.rows.map((r: any) => r.role_code);
        const mergedRoles = uniqueRoles([userResult.rows[0].role, ...assignedRoleCodes]);

        return NextResponse.json({ success: true, user: { ...userResult.rows[0], roles: mergedRoles } });
      }
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
