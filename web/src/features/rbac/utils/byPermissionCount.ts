import { type Role } from "@langfuse/shared";

import { rolePermissionCount } from "@/src/features/rbac/components/RolePermissionList";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

export const byPermissionCount = (a: Role, b: Role) =>
  rolePermissionCount(b) - rolePermissionCount(a) ||
  orderedRoles[b] - orderedRoles[a];
