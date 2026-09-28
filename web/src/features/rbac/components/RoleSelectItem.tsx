import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { SelectItem } from "@/src/components/ui/select";
import { RolePermissionTooltip } from "@/src/features/rbac/components/RolePermissionTooltip";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

/**
 * RoleSelectItem is one option in a role dropdown: an icon, the role's name and
 * description, and an info button that reveals the role's permissions in a
 * hover tooltip.
 */
export const RoleSelectItem = ({
  role,
  isProjectRole,
  emptyStateComment,
}: {
  role: SystemRole;
  isProjectRole?: boolean;
  emptyStateComment?: string;
}) => {
  const def = systemRoleAccessRights[role];
  const Icon = roleIcons[role];
  const keepDefaultNote = role === "NONE" && isProjectRole;

  return (
    <SelectItem
      value={role}
      className="group pl-2 [&>span:not([data-checkmark])]:flex-1 [&>span[data-checkmark]]:hidden"
    >
      <div className="flex w-full items-start gap-2 text-left">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex flex-col">
          <span className="font-bold">
            {def.name}
            {keepDefaultNote ? " (keep default role)" : ""}
          </span>
          <span className="text-muted-foreground text-xs">
            {def.description}
          </span>
        </div>
        <RolePermissionTooltip
          role={role}
          emptyStateComment={emptyStateComment}
        />
      </div>
    </SelectItem>
  );
};
