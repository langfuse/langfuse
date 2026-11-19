import { type Role } from "@langfuse/shared";

import { rolePermissionCount } from "@/src/features/rbac/components/RolePermissionList";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

/**
 * Sorts roles by how many permissions they grant, most first, so the roles
 * with the most access lead every list. Ties fall back to the role ladder.
 */
export const byPermissionCount = (a: Role, b: Role) =>
  rolePermissionCount(b) - rolePermissionCount(a) ||
  orderedRoles[b] - orderedRoles[a];
