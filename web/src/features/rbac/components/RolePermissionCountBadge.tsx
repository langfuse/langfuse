import { type SystemRole } from "@langfuse/shared/src/db";

import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import {
  rolePermissionCount,
  rolePermissionNoun,
  type ResourceKind,
} from "@/src/features/rbac/components/RolePermissionList";

/** RolePermissionCountBadge shows how many permissions a role grants. */
export function RolePermissionCountBadge({
  role,
  resourceKinds,
}: {
  role: SystemRole;
  resourceKinds?: ResourceKind[];
}) {
  return (
    <BadgeShell color="filled" size="sm">
      <span className="font-bold">
        {rolePermissionCount(role, resourceKinds)}
      </span>{" "}
      {rolePermissionNoun(role, resourceKinds)}
    </BadgeShell>
  );
}
