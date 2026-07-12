import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdminOrManager } from "@/lib/session";
import { mergeLegacyRoles } from "@/lib/user-roles";

export async function GET() {
  try {
    await requireAdminOrManager();
    const [usersResult, rolesResult] = await Promise.all([
      query(`
        SELECT
          wu.id,
          wu.email,
          wu.display_name,
          wu.house_number,
          wu.phone,
          wu.role,
          wu.is_admin,
          wu.notification_enabled,
          wu.last_login_at,
          wu.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', r.id,
                'role_code', r.role_code,
                'role_name_th', r.role_name_th,
                'role_name_en', r.role_name_en
              ) ORDER BY r.role_code
            ) FILTER (WHERE r.id IS NOT NULL),
            '[]'::json
          ) AS assigned_roles
        FROM slip_processing.web_users wu
        LEFT JOIN slip_processing.user_roles ur
          ON ur.user_id = wu.id
         AND ur.deleted_at IS NULL
        LEFT JOIN slip_processing.roles r
          ON r.id = ur.role_id
         AND r.deleted_at IS NULL
        WHERE wu.deleted_at IS NULL
        GROUP BY wu.id
        ORDER BY wu.is_admin DESC, wu.last_login_at DESC NULLS LAST, wu.created_at DESC
        LIMIT 200
      `),
      query(`
        SELECT id, role_code, role_name_th, role_name_en, description
        FROM slip_processing.roles
        WHERE deleted_at IS NULL
        ORDER BY CASE role_code WHEN 'admin' THEN 1 WHEN 'accountant' THEN 2 WHEN 'manager' THEN 3 WHEN 'resident' THEN 4 ELSE 9 END, role_code
      `),
    ]);

    const users = usersResult.rows.map((user: any) => {
      const assignedRoleCodes = (user.assigned_roles || []).map((role: any) => role.role_code).filter(Boolean);
      return {
        ...user,
        roles: mergeLegacyRoles(assignedRoleCodes, user.role, user.is_admin),
      };
    });

    return NextResponse.json({ users, roles: rolesResult.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err.status || 500 });
  }
}
