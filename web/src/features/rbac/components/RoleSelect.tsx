import { useState } from "react";
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
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
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
 * RoleSelect is a role picker whose options each carry a definition popup. It
 * owns the Select's open state and renders the popup as a sibling of the
 * Select, so opening the popup can close the dropdown first (Radix unmounts
 * SelectContent on close) and the popup still survives that unmount.
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
  const [open, setOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<Role | null>(null);

  const openPermissions = (role: Role) => {
    setOpen(false);
    setPermissionsRole(role);
  };

  const SelectedIcon = roleIcons[value];
  const keepDefaultNote = value === "NONE" && isProjectRole;
  const label = `${systemRoleAccessRights[value].name}${
    keepDefaultNote ? " (keep default role)" : ""
  }`;

  return (
    <>
      <Select
        open={open}
        onOpenChange={setOpen}
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
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              isProjectRole={isProjectRole}
              onViewPermissions={openPermissions}
            />
          ))}
        </SelectContent>
      </Select>
      <RolePermissionPopup
        role={permissionsRole}
        onClose={() => setPermissionsRole(null)}
        emptyStateComment={
          isProjectRole ? projectNoneRoleComment : orgNoneRoleComment
        }
      />
    </>
  );
}
