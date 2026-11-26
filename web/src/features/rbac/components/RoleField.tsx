import { useState } from "react";
import { cva } from "class-variance-authority";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/src/components/ui/select";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import {
  roleDisplay,
  roleName,
} from "@/src/features/rbac/components/roleDisplay";

const triggerVariants = cva("", {
  variants: {
    variant: {
      field: "",
      inline:
        "hover:bg-muted data-[state=open]:bg-muted w-auto border-transparent bg-transparent pr-1.5 pl-2",
    },
  },
});

const menuVariants = cva("", {
  variants: {
    variant: {
      field: "max-w-(--radix-select-trigger-width)",
      inline: "w-80",
    },
  },
});

export function RoleField({
  id,
  "aria-label": ariaLabel,
  roles,
  value,
  onChange,
  variant = "field",
  noneLabel,
  noneDescription,
  optionDisabledReason,
  disabled = false,
}: {
  id?: string;
  "aria-label"?: string;
  roles: Role[];
  value: Role;
  onChange: (role: Role) => void;
  variant?: "field" | "inline";
  noneLabel?: string;
  noneDescription?: string;
  optionDisabledReason?: (role: Role) => string | undefined;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );
  const nameOf = (role: SystemRole) =>
    role === "NONE" && noneLabel ? noneLabel : roleName(role);
  const describe = (role: SystemRole) =>
    role === "NONE" && noneDescription
      ? noneDescription
      : systemRoleAccessRights[role].description;
  const showPermissions = (role: SystemRole) => {
    setOpen(false);
    setPermissionsRole(role);
  };

  return (
    <>
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value}
        onValueChange={(next) => onChange(next as Role)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-label={ariaLabel}
          className={triggerVariants({ variant })}
        >
          <span className="truncate" title={nameOf(value)}>
            {nameOf(value)}
          </span>
        </SelectTrigger>
        <SelectContent
          align={variant === "inline" ? "end" : undefined}
          className={menuVariants({ variant })}
        >
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              display={(r) => ({
                ...roleDisplay(r),
                name: nameOf(r),
                description: describe(r),
              })}
              disabledReason={optionDisabledReason?.(role)}
              showPermissionCount
              onViewPermissions={showPermissions}
            />
          ))}
        </SelectContent>
      </Select>
      <RolePermissionPopup
        open={permissionsRole !== null}
        onOpenChange={(next) => {
          if (!next) setPermissionsRole(null);
        }}
        role={permissionsRole}
      />
    </>
  );
}
