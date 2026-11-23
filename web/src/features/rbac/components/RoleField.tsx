import { useState } from "react";
import { ArrowUpRight } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

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

export function RoleField({
  id,
  roles,
  value,
  onChange,
  noneLabel,
  noneDescription,
  optionDisabledReason,
}: {
  id: string;
  roles: Role[];
  value: Role;
  onChange: (role: Role) => void;
  noneLabel?: string;
  noneDescription?: string;
  optionDisabledReason?: (role: Role) => string | undefined;
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
    <div className="flex flex-col gap-1">
      <Select
        open={open}
        onOpenChange={setOpen}
        value={value}
        onValueChange={(next) => onChange(next as Role)}
      >
        <SelectTrigger id={id} className="h-auto" disableValueLineClamp>
          <div className="flex flex-col text-left">
            <span className="font-bold">{nameOf(value)}</span>
            <span className="text-muted-foreground text-xs">
              {describe(value)}
            </span>
          </div>
        </SelectTrigger>
        <SelectContent className="max-w-(--radix-select-trigger-width)">
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
      {!(value === "NONE" && noneLabel) && (
        <button
          type="button"
          onClick={() => setPermissionsRole(value)}
          className="text-muted-foreground hover:text-foreground w-fit text-xs"
        >
          View{" "}
          <span className="inline-flex items-center gap-0.5 underline">
            {rolePermissionCountLabel(value)}
            <ArrowUpRight size="sm" />
          </span>
        </button>
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
