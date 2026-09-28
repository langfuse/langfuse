import { cva, type VariantProps } from "class-variance-authority";
import { projectNoneRoleComment, type Role } from "@langfuse/shared";
import {
  orgNoneRoleComment,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/src/components/ui/select";
import { RolePermissionTooltipGroup } from "@/src/features/rbac/components/RolePermissionTooltip";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

const triggerVariants = cva("", {
  variants: {
    size: {
      default: "",
      compact: "w-30",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

/**
 * RoleSelect is a role picker whose options each reveal their permissions in a
 * hover tooltip.
 */
export function RoleSelect({
  roles,
  value,
  onValueChange,
  isProjectRole = false,
  disabled = false,
  triggerId,
  size,
}: {
  roles: Role[];
  value: Role;
  onValueChange: (role: Role) => void;
  isProjectRole?: boolean;
  disabled?: boolean;
  triggerId?: string;
} & VariantProps<typeof triggerVariants>) {
  const emptyStateComment = isProjectRole
    ? projectNoneRoleComment
    : orgNoneRoleComment;
  const SelectedIcon = roleIcons[value];
  const keepDefaultNote = value === "NONE" && isProjectRole;
  const label = `${systemRoleAccessRights[value].name}${
    keepDefaultNote ? " (keep default role)" : ""
  }`;

  return (
    <Select
      value={value}
      onValueChange={(role) => onValueChange(role as Role)}
      disabled={disabled}
    >
      <SelectTrigger
        id={triggerId}
        className={triggerVariants({ size })}
        disableValueLineClamp
      >
        <span className="flex min-w-0 items-center gap-2">
          <SelectedIcon className="h-4 w-4 shrink-0" />
          <span className="truncate" title={label}>
            {label}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <RolePermissionTooltipGroup>
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              isProjectRole={isProjectRole}
              emptyStateComment={emptyStateComment}
            />
          ))}
        </RolePermissionTooltipGroup>
      </SelectContent>
    </Select>
  );
}
