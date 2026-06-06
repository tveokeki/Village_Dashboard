import { getCurrentUser, type AppUser } from "@/lib/session";
import { getUserRoles, mergeLegacyRoles, type AppRole } from "@/lib/user-roles";

export type FinanceRole = AppRole;

export type FinanceUser = AppUser & {
  roles: FinanceRole[];
  hasRole: (role: FinanceRole) => boolean;
  hasAnyRole: (roles: FinanceRole[]) => boolean;
};

export async function requireAnyRole(allowedRoles: FinanceRole[]): Promise<FinanceUser> {
  const user = await getCurrentUser();
  if (!user?.id) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const roles = mergeLegacyRoles(await getUserRoles(user.id), user.role, user.isAdmin);
  const roleSet = new Set<FinanceRole>(roles);
  const permitted = allowedRoles.some((role) => roleSet.has(role));
  if (!permitted) {
    const err: any = new Error(`Permission required: ${allowedRoles.join(" or ")}`);
    err.status = 403;
    throw err;
  }

  return {
    ...user,
    roles,
    hasRole: (role: FinanceRole) => roleSet.has(role),
    hasAnyRole: (required: FinanceRole[]) => required.some((role) => roleSet.has(role)),
  };
}

export async function requireFinanceAccess() {
  return requireAnyRole(["admin", "accountant", "manager"]);
}

export async function requireExpenseRequesterRole() {
  return requireAnyRole(["accountant", "manager"]);
}

export function assertNotSelfApproval(requestedBy: string, approverId: string) {
  if (requestedBy === approverId) {
    const err: any = new Error("Separation of duties violation: requester and approver must be different users");
    err.status = 403;
    throw err;
  }
}
