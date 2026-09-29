import { SquareArrowOutUpRight } from "lucide-react";
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { SelectItem } from "@/src/components/ui/select";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

/**
 * RoleSelectItem is one option in a role dropdown: an icon, the role's name and
 * description, and a square-arrow button that opens the role's permission
 * popup. The button stops event propagation so it never selects the role.
 */
export const RoleSelectItem = ({
  role,
  isProjectRole,
  onViewPermissions,
}: {
  role: SystemRole;
  isProjectRole?: boolean;
  onViewPermissions: (role: SystemRole) => void;
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
        <Tooltip label="View permissions" hoverableContent={false} delay={0}>
          {({ getTriggerProps }) => (
            <button
              type="button"
              {...getTriggerProps()}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewPermissions(role);
              }}
              aria-label={`View ${def.name} permissions`}
              className="text-muted-foreground hover:bg-background hover:text-foreground ml-auto flex h-6 w-6 shrink-0 items-center justify-center self-center rounded-full opacity-0 group-hover:opacity-100 group-data-highlighted:opacity-100 focus-visible:opacity-100"
            >
              <SquareArrowOutUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </Tooltip>
      </div>
    </SelectItem>
  );
};
