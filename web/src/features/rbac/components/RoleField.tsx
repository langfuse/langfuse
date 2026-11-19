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
import { roleIcons } from "@/src/features/rbac/components/roleIcons";

/**
 * A role picker shaped like the API key permissions field: the selected role
 * with its description, options with a permissions preview, and a link to the
 * full permission list.
 */
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
  /** Label for NONE, e.g. "Inherit from organization" on a project. */
  noneLabel?: string;
  /** Description for NONE when it means something other than "no access". */
  noneDescription?: string;
  optionDisabledReason?: (role: Role) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [permissionsRole, setPermissionsRole] = useState<SystemRole | null>(
    null,
  );
  const nameOf = (name: string) =>
    noneLabel && name === systemRoleAccessRights.NONE.name ? noneLabel : name;
  const selected = systemRoleAccessRights[value];
  const describe = (role: Role) =>
    role === "NONE" && noneDescription
      ? noneDescription
      : systemRoleAccessRights[role].description;
  const SelectedIcon = roleIcons[value];
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
          <div className="flex items-start gap-2 text-left">
            <SelectedIcon size="base" __rawClassName="mt-0.5" />
            <div className="flex flex-col">
              <span className="font-bold">{nameOf(selected.name)}</span>
              <span className="text-muted-foreground text-xs">
                {describe(value)}
              </span>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          {roles.map((role) => (
            <RoleSelectItem
              key={role}
              role={role}
              transformName={nameOf}
              description={describe(role)}
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
          className="text-muted-foreground hover:text-foreground ml-1 w-fit text-xs"
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
