import { useId, useState } from "react";
import { Building, House } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { includesRole } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { memberCountLabel } from "@/src/features/groups/groupMember";
import {
  groupRoleOptions,
  inheritedRoleDescription,
  isGroupRole,
  noOrgRoleDescription,
  onProjectLevel,
  orgRoleNote,
  resolveGroupRole,
  type GroupLevel,
  type GroupRole,
} from "@/src/features/groups/groupRoles";
import { SCIM_MANAGED_LABEL } from "@/src/features/groups/groupSource";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";
import { roleName } from "@/src/features/rbac/components/roleDisplay";

export type GroupRoleDialogProps = {
  level: GroupLevel;
  groupName: string;
  isScimManaged?: boolean;
  projectName?: string;
  memberCount: number;
  orgRole: Role | null;
  projectRole?: Role | null;
  grantableRoles?: Role[];
  isAiGatewayEnabled?: boolean;
  disabledReason?: string;
  onChange: (role: GroupRole | null) => void;
  children?: React.ReactNode;
};

export function GroupRoleDialog({
  level,
  groupName,
  isScimManaged = false,
  projectName,
  memberCount,
  orgRole: orgRoleOrNull,
  projectRole = null,
  grantableRoles,
  isAiGatewayEnabled = false,
  disabledReason,
  onChange,
  onDone,
  children,
}: GroupRoleDialogProps & { onDone: () => void }) {
  const fieldId = useId();
  const orgRole = orgRoleOrNull ?? "NONE";
  const onProject = level === "project";
  const levelOrgRole = onProject ? onProjectLevel(orgRole) : orgRole;
  const resolved = resolveGroupRole(level, orgRole, projectRole);
  const [selected, setSelected] = useState<Role>(resolved.editing);
  const noneDescription = onProject
    ? inheritedRoleDescription(levelOrgRole)
    : noOrgRoleDescription;
  const roleNote = onProject ? undefined : orgRoleNote(selected);
  const notes = [
    disabledReason,
    selected === "NONE" ? noneDescription : roleNote,
  ].filter(Boolean);

  const optionDisabledReason = (role: Role) => {
    if (
      grantableRoles &&
      role !== "NONE" &&
      !grantableRoles.includes(role) &&
      role !== resolved.editing
    )
      return "You cannot grant this role";
    // The inherited role already covers it, so "inherit" is the way to clear it.
    if (
      onProject &&
      role !== "NONE" &&
      levelOrgRole !== "NONE" &&
      includesRole(levelOrgRole, role, "project")
    )
      return `No effect: ${groupName} already gives ${roleName(levelOrgRole)} in the organization`;
    return undefined;
  };

  return (
    <Dialog
      noCapture
      icon={onProject ? House : Building}
      title={onProject ? "Project access" : "Organization access"}
      description={`${groupName} · ${memberCountLabel(memberCount)}`}
      footerHint={isScimManaged ? SCIM_MANAGED_LABEL : undefined}
      closeLabel="Cancel"
      actions={[
        {
          label: "Save",
          disabled:
            disabledReason !== undefined || selected === resolved.editing,
          onClick: () => {
            onChange(isGroupRole(selected) ? selected : null);
            onDone();
          },
        },
      ]}
    >
      <Dialog.Body separators="both">
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor={fieldId} className="font-bold">
              {onProject
                ? `Role in ${projectName ?? "this project"}`
                : "Role in the organization"}
            </label>
            {selected !== "NONE" && <RolePermissionsLink role={selected} />}
          </div>
          <RoleField
            id={fieldId}
            roles={groupRoleOptions(level, isAiGatewayEnabled)}
            value={selected}
            onChange={setSelected}
            disabled={disabledReason !== undefined}
            noneLabel={onProject ? "Inherit from organization" : undefined}
            noneDescription={noneDescription}
            optionDisabledReason={optionDisabledReason}
          />
          {notes.map((note) => (
            <p key={note} className="text-muted-foreground text-xs">
              {note}
            </p>
          ))}
        </div>
        {children}
      </Dialog.Body>
    </Dialog>
  );
}
