import { type SystemRole } from "@langfuse/shared/src/db";

import { Badge } from "@/src/components/ui/badge";
import { systemRoleAccessRights } from "@/src/features/rbac/constants/systemRoleAccessRights";
import { type SystemRolePolicy } from "@/src/features/rbac/types";

type ResourceKind = SystemRolePolicy["resourceKind"];

const resourceKindLabels: Record<ResourceKind, string> = {
  organization: "Organization",
  project: "Project",
};

const resourceKindOrder: ResourceKind[] = ["organization", "project"];

/** rolePermissionCount is the total number of actions a role grants across all its policies. */
export const rolePermissionCount = (role: SystemRole): number =>
  systemRoleAccessRights[role].policies.reduce(
    (total, policy) => total + policy.actions.length,
    0,
  );

/** RolePermissionList renders a role's granted actions as badges, grouped by resource kind. */
export const RolePermissionList = ({ role }: { role: SystemRole }) => {
  const { policies } = systemRoleAccessRights[role];

  if (policies.length === 0)
    return (
      <p className="text-muted-foreground text-sm italic">
        No permissions granted.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {resourceKindOrder.map((kind) => {
        const actions = policies
          .filter((policy) => policy.resourceKind === kind)
          .flatMap((policy) => policy.actions);
        if (actions.length === 0) return null;

        return (
          <div key={kind} className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
              {resourceKindLabels[kind]}
            </span>
            <div className="flex flex-wrap gap-1">
              {actions.map((action) => (
                <Badge
                  key={action}
                  variant="outline"
                  className="font-mono text-[0.65rem]"
                >
                  {action}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
