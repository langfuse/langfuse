import { SquareArrowOutUpRight } from "lucide-react";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { SelectItem } from "@/src/components/ui/select";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

/**
 * RoleSelectItem is one option in a role dropdown: an icon, the role's name and
 * description, and a square-arrow-out button that opens the role's definition
 * popup. The button stops event propagation so it never selects the role.
 * The popup itself is owned by RoleSelect, which renders it as a sibling of the
 * Select so it survives the Select unmounting on close.
 */
export const RoleSelectItem = ({
  role,
  isProjectRole,
  onViewPermissions,
}: {
  role: Role;
  isProjectRole?: boolean;
  onViewPermissions: (role: Role) => void;
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
        <button
          type="button"
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
      </div>
    </SelectItem>
  );
};
