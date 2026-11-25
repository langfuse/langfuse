import { useState } from "react";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Button } from "@/src/components/design-system/Button/Button";
import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/src/components/ui/select";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { RolePermissionPopup } from "@/src/features/rbac/components/RolePermissionPopup";
import { RoleSelectItem } from "@/src/features/rbac/components/RoleSelectItem";
import {
  roleDisplay,
  roleName,
} from "@/src/features/rbac/components/roleDisplay";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

export function RoleField({
  id,
  "aria-label": ariaLabel,
  roles,
  value,
  onChange,
  variant = "detailed",
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
  variant?: "detailed" | "compact";
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
  const SelectedIcon = roleIcons[value];
  const showPermissions = (role: SystemRole) => {
    setOpen(false);
    setPermissionsRole(role);
  };
  const isCompact = variant === "compact";

  return (
    <div className="flex flex-col gap-1">
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
          className={isCompact ? "w-40" : "h-auto"}
          disableValueLineClamp
        >
          <div className="flex min-w-0 items-start gap-2 text-left">
            <SelectedIcon size="base" __rawClassName="mt-0.5" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-bold" title={nameOf(value)}>
                {nameOf(value)}
              </span>
              {!isCompact && (
                <span className="text-muted-foreground text-xs">
                  {describe(value)}
                </span>
              )}
            </div>
          </div>
        </SelectTrigger>
        <SelectContent
          align={isCompact ? "end" : undefined}
          className={
            isCompact ? "w-80" : "max-w-(--radix-select-trigger-width)"
          }
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
      {!isCompact && !(value === "NONE" && noneLabel) && (
        <span className="w-fit">
          <Button
            variant="text"
            size="sm"
            text={`View ${rolePermissionCountLabel(value)}`}
            onClick={() => setPermissionsRole(value)}
          />
        </span>
      )}
      <RolePermissionPopup
        open={permissionsRole !== null}
        onOpenChange={(next) => {
          if (!next) setPermissionsRole(null);
        }}
        role={permissionsRole}
      />
    </div>
  );
}
