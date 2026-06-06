import { query } from "@/lib/db";

export type AppRole = "admin" | "accountant" | "manager" | "resident";

const VALID_ROLES = new Set<AppRole>(["admin", "accountant", "manager", "resident"]);

export function normalizeRole(role?: string | null): AppRole | null {
  if (!role) return null;
  const normalized = role.trim().toLowerCase() as AppRole;
  return VALID_ROLES.has(normalized) ? normalized : null;
}

export async function getUserRoles(userId: string): Promise<AppRole[]> {
  const result = await query(
    `SELECT r.role_code
     FROM slip_processing.user_roles ur
     JOIN slip_processing.roles r ON r.id = ur.role_id
     WHERE ur.user_id = $1
       AND ur.deleted_at IS NULL
       AND r.deleted_at IS NULL
     ORDER BY r.role_code`,
    [userId]
  );
  return result.rows.map((row: any) => normalizeRole(row.role_code)).filter(Boolean) as AppRole[];
}

export function mergeLegacyRoles(roles: AppRole[], legacyRole?: string | null, isAdmin?: boolean): AppRole[] {
  const roleSet = new Set<AppRole>(roles);
  const normalizedLegacy = normalizeRole(legacyRole);
  if (normalizedLegacy) roleSet.add(normalizedLegacy);
  if (isAdmin) roleSet.add("admin");
  return Array.from(roleSet);
}
