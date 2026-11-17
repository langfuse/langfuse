import { type SystemRole } from "@langfuse/shared/src/db";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  rolePermissionCount,
  rolePermissionNoun,
} from "@/src/features/rbac/components/RolePermissionList";

/** RolePermissionCountBadge shows how many permissions a role grants. */
export function RolePermissionCountBadge({
  role,
  size = "sm",
}: {
  role: SystemRole;
  size?: "sm" | "xs";
}) {
  return (
    <BadgeShell color="filled" size={size}>
      <span className="font-bold">{rolePermissionCount(role)}</span>{" "}
      {rolePermissionNoun(role)}
    </BadgeShell>
  );
}
