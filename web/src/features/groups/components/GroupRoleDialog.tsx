import { useId, useState } from "react";
import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import {
  grantsAccess,
  includesRole,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";
import { GroupLink } from "@/src/features/groups/components/GroupLink";
import {
  GroupMemberList,
  type GroupMember,
} from "@/src/features/groups/components/GroupMemberList";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { SCIM_MANAGED_LABEL } from "@/src/features/groups/groupSource";
import { AccessDialog } from "@/src/features/rbac/components/AccessDialog";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";
import { RoleSelect } from "@/src/features/rbac/components/RoleSelect";
import {
  roleDisplay,
  roleName,
} from "@/src/features/rbac/components/roleDisplay";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";

type GroupRole = "ADMIN" | "MEMBER" | "VIEWER" | "AI_GATEWAY";

export const noOrgRoleDescription = "The group gives no organization role.";

type Level = "organization" | "project";

const OPTIONS: Role[] = ["NONE", "ADMIN", "MEMBER", "VIEWER"];

export const groupRoleOptions = (
  level: Level,
  isAiGatewayEnabled: boolean,
): Role[] =>
  (level === "organization" && isAiGatewayEnabled
    ? [...OPTIONS, "AI_GATEWAY" as const]
    : OPTIONS
  ).toSorted(byPermissionCount);

const onProjectLevel = (role: Role): Role =>
  grantsAccess(role, "project") ? role : "NONE";

function orgRoleTag(orgRole: Role): string {
  if (orgRole === "NONE") return "No organization role";
  if (orgRole === "AI_GATEWAY") return "Organization only";
  return "Applies in every project";
}

type Source = {
  key: string;
  tag: string;
  role: Role;
  /** A project role at or below the inherited role adds nothing. */
  unused: boolean;
};

/** Groups only add access, so on a project a role counts only when it is higher than the group's org role. */
function resolveGroupRole(
  level: Level,
  orgRole: Role,
  projectRole: Role | null,
): { role: Role; tag: string; sources: Source[]; editing: Role } {
  if (level === "organization")
    return {
      role: orgRole,
      tag: orgRoleTag(orgRole),
      sources: [],
      editing: orgRole,
    };
  const inherited = onProjectLevel(orgRole);
  const projectApplies =
    projectRole !== null && !includesRole(inherited, projectRole, "project");
  let tag = "No role here";
  if (projectApplies) tag = "Set on this project";
  else if (inherited !== "NONE") tag = "Inherited from organization";
  const sources: Source[] = [
    {
      key: "organization",
      tag: "Inherited from organization",
      role: inherited,
      unused: false,
    },
    {
      key: "project",
      tag: "Set on this project",
      role: projectRole ?? "NONE",
      unused: !projectApplies,
    },
  ];
  return {
    role: projectApplies && projectRole ? projectRole : inherited,
    tag,
    sources: sources
      .filter((source) => source.role !== "NONE")
      .toSorted((x, y) => byPermissionCount(x.role, y.role)),
    editing: projectRole ?? "NONE",
  };
}

export type GroupRoleDialogProps = {
  level: Level;
  groupName: string;
  /** Opens the group on the organization's Groups page. */
  groupHref?: string | null;
  /** Synced from the identity provider, so its members are managed there. */
  isScimManaged?: boolean;
  /** Project level only. */
  projectName?: string;
  /** Project level only: makes the project's name a link. */
  projectHref?: string;
  memberCount: number;
  /** Lists the members; omitted when not all of them are known. */
  members?: GroupMember[];
  /** Shown above the members, e.g. a control to add some. */
  membersToolbar?: React.ReactNode;
  /** Adds a remove button to each member. */
  onRemoveMember?: (member: GroupMember) => void;
  membersError?: string;
  /** A further sentence after the role's note, e.g. roles the group has elsewhere. */
  roleFootnote?: string;
  orgRole: Role | null;
  projectRole?: Role | null;
  grantableRoles?: Role[];
  isAiGatewayEnabled?: boolean;
  disabledReason?: string;
  onChange: (role: GroupRole | null) => void;
};

export function GroupRoleDialog({
  level,
  groupName,
  groupHref,
  isScimManaged = false,
  projectName,
  projectHref,
  memberCount,
  members,
  membersToolbar,
  onRemoveMember,
  membersError,
  roleFootnote,
  orgRole: orgRoleOrNull,
  projectRole = null,
  grantableRoles,
  isAiGatewayEnabled = false,
  disabledReason,
  onChange,
  onDone,
}: GroupRoleDialogProps & { onDone: () => void }) {
  const fieldId = useId();
  const orgRole = orgRoleOrNull ?? "NONE";
  const onProject = level === "project";
  const levelOrgRole = onProject ? onProjectLevel(orgRole) : orgRole;
  const resolved = resolveGroupRole(level, orgRole, projectRole);
  const [selected, setSelected] = useState<Role>(resolved.editing);
  // Without edit rights the dialog describes the saved role.
  const shown = disabledReason ? resolved.editing : selected;
  // What the group gives at this level for the role picked so far.
  const givenRole = onProject
    ? resolveGroupRole(level, orgRole, shown === "NONE" ? null : shown).role
    : shown;
  const projectLabel = projectName ?? "this project";
  const heading = onProject
    ? `Role in ${projectLabel}`
    : "Role in the organization";
  // On a project the group starts from its organization role. That role's own row
  // stands for "no project role", so the list never names the same role twice.
  const hasOrgDefault = onProject && levelOrgRole !== "NONE";
  const toPicker = (role: Role): Role =>
    hasOrgDefault && role === "NONE" ? levelOrgRole : role;
  const fromPicker = (role: Role): Role =>
    hasOrgDefault && role === levelOrgRole ? "NONE" : role;
  const isOrgDefault = (role: SystemRole) =>
    hasOrgDefault && role === levelOrgRole;
  const describe = (role: SystemRole) => {
    if (isOrgDefault(role))
      return "Granted through the group's organization role.";
    if (role !== "NONE") return systemRoleAccessRights[role].description;
    return onProject
      ? "No access to this project through this group."
      : noOrgRoleDescription;
  };
  const triggerLabel = (role: Role) =>
    hasOrgDefault && role === "NONE"
      ? `${roleName(levelOrgRole)} · from organization`
      : roleName(role);
  // On a project the picker and its options already say what the role does.
  const roleNote = ((): string | undefined => {
    if (onProject) return undefined;
    if (shown === "NONE") return describe(shown);
    if (shown === "AI_GATEWAY")
      return "Adds AI Gateway access on top of each member's existing role.";
    return "Applies to all projects in this organization.";
  })();
  const optionDisabledReason = (role: Role) => {
    if (isOrgDefault(role)) return undefined;
    if (
      grantableRoles &&
      role !== "NONE" &&
      !grantableRoles.includes(role) &&
      role !== resolved.editing
    )
      return "You cannot grant this role";
    if (
      onProject &&
      role !== "NONE" &&
      levelOrgRole !== "NONE" &&
      includesRole(levelOrgRole, role, "project")
    )
      return `No effect: ${groupName} already gives ${roleName(levelOrgRole)} in the organization`;
    return undefined;
  };
  const picker = (
    <RoleSelect
      triggerId={fieldId}
      autoFocus
      menu="trigger"
      roles={groupRoleOptions(level, isAiGatewayEnabled).filter(
        (role) => !hasOrgDefault || role !== "NONE",
      )}
      value={toPicker(shown)}
      onValueChange={(role) => setSelected(fromPicker(role))}
      disabled={disabledReason !== undefined}
      isProjectRole={onProject}
      display={(role) => ({
        ...roleDisplay(role),
        description: describe(role),
      })}
      valueLabel={triggerLabel(shown)}
      optionDisabledReason={optionDisabledReason}
    />
  );
  const groupLabel = groupHref ? (
    <GroupLink
      href={groupHref}
      className="text-link hover:text-link-hover"
      onClick={onDone}
    >
      {groupName}
    </GroupLink>
  ) : (
    groupName
  );

  return (
    <AccessDialog
      level={level}
      projectName={projectName}
      projectHref={projectHref}
      subject={
        <span className="text-muted-foreground">
          {groupLabel} · {memberCountLabel(memberCount)}
        </span>
      }
      isSaveDisabled={
        disabledReason !== undefined || selected === resolved.editing
      }
      onSave={() => {
        onChange(selected === "NONE" ? null : (selected as GroupRole));
        onDone();
      }}
      footerNote={
        isScimManaged ? (
          <span className="inline-flex items-center gap-1.5">
            <Lock size="sm" aria-hidden="true" />
            {SCIM_MANAGED_LABEL}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={fieldId} className="font-bold">
            {heading}
          </label>
          {givenRole !== "NONE" && <RolePermissionsLink roles={[givenRole]} />}
        </div>
        {disabledReason ? (
          <DisabledActionTooltip label={disabledReason} isFullWidth>
            {picker}
          </DisabledActionTooltip>
        ) : (
          picker
        )}
        {roleNote && (
          <p className="text-muted-foreground">
            {roleNote}
            {roleFootnote ? ` ${roleFootnote}` : ""}
          </p>
        )}
      </div>

      {members && (
        <div className="flex flex-col gap-2">
          <p className="flex items-baseline gap-1.5 font-bold">
            Members
            <span className="text-muted-foreground font-normal">
              {memberCount}
            </span>
          </p>
          {membersToolbar}
          {members.length > 0 ? (
            <GroupMemberList members={members} onRemove={onRemoveMember} />
          ) : (
            <p className="text-muted-foreground">This group has no members.</p>
          )}
          {membersError && <p className="text-destructive">{membersError}</p>}
        </div>
      )}
    </AccessDialog>
  );
}

export function describeGroupRoleCell(props: {
  level: Level;
  groupName: string;
  orgRole: Role | null;
  projectRole?: Role | null;
}) {
  const resolved = resolveGroupRole(
    props.level,
    props.orgRole ?? "NONE",
    props.projectRole ?? null,
  );
  const roleKind = props.level === "project" ? "project" : "organization";
  return {
    roles: [resolved.role],
    label: `${roleName(resolved.role)}, ${resolved.tag}. Change the ${roleKind} role of ${props.groupName}`,
  };
}
