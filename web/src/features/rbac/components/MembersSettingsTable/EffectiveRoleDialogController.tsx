import { useState } from "react";
import { Check, InfoIcon } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { type SystemRole } from "@langfuse/shared/src/db";
import {
  grantsAccess,
  includesRole,
  resolveEffectiveRoles,
  type AccessLevel,
} from "@langfuse/shared/rbac";

import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { GroupLink } from "@/src/features/groups/components/GroupLink";
import { GroupNameLabel } from "@/src/features/groups/components/GroupNameLabel";
import { GroupSummaryCard } from "@/src/features/groups/components/GroupSummaryCard/GroupSummaryCard";
import { AccessDialog } from "@/src/features/rbac/components/AccessDialog";
import {
  RoleSelect,
  roleTrailingSpacing,
} from "@/src/features/rbac/components/RoleSelect";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";
import {
  roleDisplay,
  roleName,
} from "@/src/features/rbac/components/roleDisplay";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
import { cn } from "@/src/utils/tailwind";
import { type MemberGroupRole } from "./MembersSettingsTable";

function levelNote(
  grant: MemberGroupRole,
  grants: MemberGroupRole[],
): "project" | "org" | undefined {
  const conflictsAcrossLevels = grants.some(
    (other) =>
      other.groupId === grant.groupId &&
      other.level !== grant.level &&
      other.role !== grant.role,
  );
  if (!conflictsAcrossLevels) return undefined;
  return grant.level === "project" ? "project" : "org";
}

function inheritNoneDescription(orgRole: Role): string {
  if (orgRole === "AI_GATEWAY" || orgRole === "NONE") {
    return "No direct access to this project.";
  }
  return `Uses the organization role (${roleName(orgRole)}).`;
}

const joinNames = (names: string[]) => [...new Set(names)].join(", ");

export type EffectiveRole = {
  /** `["NONE"]` when nothing applies. */
  roles: Role[];
  role: Role;
  raisedByGroup: boolean;
  direct: Role;
  directIsOrgDefault: boolean;
  /** Direct roles it includes can't be picked. */
  groupFloor: Role | null;
  grants: MemberGroupRole[];
  level: AccessLevel;
};

export function resolveEffectiveRole({
  orgRole,
  projectRole,
  groupRoles,
  level,
}: {
  orgRole: Role;
  projectRole?: Role;
  groupRoles: MemberGroupRole[];
  level: AccessLevel;
}): EffectiveRole {
  const onProject = level === "project";
  const atLevel = (role: Role): Role =>
    grantsAccess(role, level) ? role : "NONE";
  const grants = groupRoles
    .filter((grant) => onProject || grant.level === "organization")
    .filter((grant) => grantsAccess(grant.role, level))
    .toSorted((a, b) => byPermissionCount(a.role, b.role));
  const directIsOrgDefault = onProject && projectRole === undefined;
  const direct = atLevel(onProject ? (projectRole ?? orgRole) : orgRole);
  const ownRole: Role = direct === "AI_GATEWAY" ? "NONE" : direct;
  const groupFloor =
    grants.find((grant) => grant.role !== "AI_GATEWAY")?.role ?? null;
  const role =
    groupFloor && !includesRole(ownRole, groupFloor, level)
      ? groupFloor
      : ownRole;
  const roles = resolveEffectiveRoles(
    [direct, ...grants.map((grant) => grant.role)],
    level,
  ).toSorted(byPermissionCount);

  return {
    roles: roles.length > 0 ? roles : ["NONE"],
    role,
    raisedByGroup: role !== ownRole,
    direct,
    directIsOrgDefault,
    groupFloor,
    grants,
    level,
  };
}

const floorGrants = (effective: EffectiveRole) =>
  effective.grants.filter((grant) => grant.role === effective.groupFloor);

export const belowGroupFloor =
  (effective: EffectiveRole, { allowNone }: { allowNone: boolean }) =>
  (role: Role) => {
    const floor = effective.groupFloor;
    // AI Gateway sits beside the ladder, so a group never locks it.
    if (
      !floor ||
      role === "AI_GATEWAY" ||
      role === floor ||
      !includesRole(floor, role, effective.level)
    )
      return undefined;
    if (allowNone && role === "NONE") return undefined;
    const names = joinNames(
      floorGrants(effective).map((grant) => grant.groupName),
    );
    return `${names} already gives ${roleName(floor)}`;
  };

type GroupReason = {
  key: string;
  groupId: string;
  label: string;
  level: MemberGroupRole["level"];
  source: MemberGroupRole["groupSource"];
  memberCount: number;
  memberPreview: MemberGroupRole["memberPreview"];
  role: Role;
  levelNote?: string;
  /** Opens the group's members on the organization's Groups page; null when the viewer cannot open that page. */
  href: string | null;
};

/** One entry per group and role; a group giving the same role at both levels shows once. */
function groupReasons(
  effective: EffectiveRole,
  { orgId, canSeeOrgGroups }: { orgId: string; canSeeOrgGroups: boolean },
): GroupReason[] {
  const reasons: GroupReason[] = [];
  for (const grant of effective.grants) {
    if (
      reasons.some(
        (other) => other.groupId === grant.groupId && other.role === grant.role,
      )
    )
      continue;
    reasons.push({
      key: `${grant.groupId}-${grant.level}`,
      groupId: grant.groupId,
      label: grant.groupName,
      level: grant.level,
      source: grant.groupSource,
      memberCount: grant.memberCount,
      memberPreview: grant.memberPreview,
      role: grant.role,
      levelNote: levelNote(grant, effective.grants),
      href: canSeeOrgGroups
        ? `/organization/${orgId}/settings/groups?group=${encodeURIComponent(grant.groupId)}`
        : null,
    });
  }
  return reasons;
}

/** The organization role, listed on a project as its own row. */
function organizationRoleOnProject(
  orgRole: Role,
  onProject: boolean,
): Role | null {
  if (!onProject) return null;
  // A None or AI Gateway org role gives nothing on a project; the picker already says so.
  if (orgRole === "NONE" || orgRole === "AI_GATEWAY") return null;
  return orgRole;
}

function raisingGrants(effective: EffectiveRole) {
  const { role, raisedByGroup, direct, grants } = effective;
  return grants.filter(
    (grant) =>
      (raisedByGroup && grant.role === role) ||
      (grant.role === "AI_GATEWAY" &&
        direct !== "AI_GATEWAY" &&
        effective.roles.includes("AI_GATEWAY")),
  );
}

function sourceTag(effective: EffectiveRole, onProject: boolean) {
  const raising = raisingGrants(effective);
  if (raising.length > 0)
    return `From ${joinNames(raising.map((grant) => grant.groupName))}`;
  if (effective.directIsOrgDefault) return "Inherited from organization";
  return onProject ? "Set on this project" : "Set directly";
}

function lockNote(
  effective: EffectiveRole,
  firstName: string,
  hrefOf: (groupId: string) => string | null,
) {
  const floorGroups = floorGrants(effective).filter(
    (grant, index, all) =>
      all.findIndex((other) => other.groupId === grant.groupId) === index,
  );
  return (
    <>
      Anything below {roleName(effective.groupFloor ?? effective.role)} has no
      effect while {firstName} is in{" "}
      {floorGroups.map((grant, index) => {
        const href = hrefOf(grant.groupId);
        return (
          <span key={grant.groupId}>
            {index > 0 && ", "}
            {href ? (
              <GroupLink
                href={href}
                className="text-link hover:text-link-hover underline underline-offset-2"
              >
                {grant.groupName}
              </GroupLink>
            ) : (
              grant.groupName
            )}
          </span>
        );
      })}
      . To lower it, remove {firstName} from the group.
    </>
  );
}

/** Names a project's direct roles: none of its own is described as keeping the organization role. */
const projectRoleDisplay = (orgRole: Role) => (role: SystemRole) =>
  role === "NONE"
    ? {
        name: roleName(role),
        description: inheritNoneDescription(orgRole),
      }
    : roleDisplay(role);

export type DirectRoleEditor = {
  roles: Role[];
  value: Role;
  isProjectRole: boolean;
  disabledReason?: string;
  optionDisabledReason: (role: Role) => string | undefined;
  onChange: (role: Role) => void;
};

type EffectiveRoleSourceProps = {
  effective: EffectiveRole;
  orgRole: Role;
  orgId: string;
  projectId?: string;
  projectName?: string;
  /** Whether the viewer may open the organization's Groups page. */
  canSeeOrgGroups: boolean;
  /** Whether the viewer may change groups and their members. */
  canManageOrgGroups: boolean;
  member: { name: string | null; email: string | null };
  editor: DirectRoleEditor;
};

/** A group that gives a role: its name opens the group's members and its card summarizes the group. */
function GroupName({
  group,
  canEditGroup,
}: {
  group: GroupReason;
  canEditGroup: boolean;
}) {
  const content = (
    <>
      <GroupNameLabel name={group.label} />
      {group.levelNote && (
        <span className="text-foreground-tertiary shrink-0">
          ({group.levelNote})
        </span>
      )}
    </>
  );
  return (
    <span className="flex min-w-0">
      <HoverCard
        openDelay={150}
        closeDelay={100}
        placement="bottom"
        content={
          <GroupSummaryCard
            name={group.label}
            level={group.level}
            source={group.source}
            role={group.role}
            memberCount={group.memberCount}
            memberPreview={group.memberPreview}
            membersHref={group.href}
            canEditGroup={canEditGroup}
          />
        }
      >
        {({ getTriggerProps }) =>
          group.href ? (
            <GroupLink
              href={group.href}
              className="focus-visible:ring-ring flex min-w-0 items-center gap-1 rounded-sm hover:underline focus-visible:ring-2 focus-visible:outline-hidden"
              {...getTriggerProps()}
            >
              {content}
            </GroupLink>
          ) : (
            <span
              className="flex min-w-0 items-center gap-1"
              tabIndex={0}
              {...getTriggerProps()}
            >
              {content}
            </span>
          )
        }
      </HoverCard>
    </span>
  );
}

/** One source of a member's access: what it is on the left, the role it gives on the right. */
function SourceRow({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-h-11 items-center justify-between gap-3 pr-0.5 pl-1.5">
      <span className="flex min-w-0">{label}</span>
      <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
        {children}
      </span>
    </li>
  );
}

/** Marks the role a member ends up with. */
function EffectiveMarker() {
  return (
    <Tooltip label="This role applies">
      {({ getTriggerProps }) => (
        <span
          role="img"
          aria-label="This role applies"
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
          {...getTriggerProps()}
        >
          <Check size="sm" color="inherit" aria-hidden="true" />
        </span>
      )}
    </Tooltip>
  );
}

/** A role set elsewhere, so it only reads here. It ends where the picker's role name ends. */
function ReadOnlyRole({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex items-center", roleTrailingSpacing)}>
      {children}
      <span className="invisible inline-flex" aria-hidden="true">
        <DropdownIndicator />
      </span>
    </span>
  );
}

function RoleDialog({
  effective: saved,
  orgRole,
  orgId,
  projectId,
  projectName,
  canSeeOrgGroups,
  canManageOrgGroups,
  member,
  editor,
  onDone,
}: EffectiveRoleSourceProps & { onDone: () => void }) {
  const onProject = Boolean(projectId);
  const [selected, setSelected] = useState<Role>(editor.value);
  const [hasTriedRoles, setHasTriedRoles] = useState(false);
  // Previews the role being picked, before it is saved.
  const effective =
    selected === editor.value
      ? saved
      : resolveEffectiveRole({
          orgRole: onProject ? orgRole : selected,
          projectRole: onProject && selected !== "NONE" ? selected : undefined,
          groupRoles: saved.grants,
          level: saved.level,
        });
  const groups = groupReasons(effective, { orgId, canSeeOrgGroups });
  const organizationRole = organizationRoleOnProject(orgRole, onProject);
  // A direct project role replaces the organization role on that project.
  const isOrganizationRoleReplaced =
    organizationRole !== null && !effective.directIsOrgDefault;
  const inGroups = groups.length > 0;
  const listedRoleCount =
    groups.length + (organizationRole ? 1 : 0) + (selected === "NONE" ? 0 : 1);
  // With a single role listed there is nothing to tell apart.
  const isEffective = (role: Role) =>
    listedRoleCount > 1 && effective.roles.includes(role);
  const grantedRoles = effective.roles.filter((role) => role !== "NONE");
  const displayName = member.name ?? member.email ?? "This member";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const directRoleDisplay = editor.isProjectRole
    ? projectRoleDisplay(orgRole)
    : roleDisplay;
  const directRoleName = directRoleDisplay(selected).name;
  const isLockedByGroup = editor.roles.some(
    (role) =>
      belowGroupFloor(saved, { allowNone: editor.isProjectRole })(role) !==
      undefined,
  );

  const directRolePicker = (
    <RoleSelect
      aria-label={`Directly assigned role: ${directRoleName}`}
      appearance="ghost"
      menu="wide"
      roles={editor.roles}
      value={selected}
      onValueChange={setSelected}
      onOpenChange={(open) => {
        // Waits for the options to close, so nothing moves under the pointer.
        if (!open) setHasTriedRoles(true);
      }}
      isProjectRole={editor.isProjectRole}
      display={directRoleDisplay}
      optionDisabledReason={editor.optionDisabledReason}
      disabled={editor.disabledReason !== undefined}
    />
  );

  return (
    <AccessDialog
      level={onProject ? "project" : "organization"}
      projectName={projectName}
      subject={member.email ?? displayName}
      isSaveDisabled={
        editor.disabledReason !== undefined || selected === editor.value
      }
      onSave={() => {
        editor.onChange(selected);
        onDone();
      }}
    >
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-muted-foreground font-bold">
            {inGroups ? "Access granted through" : "Access"}
          </h3>
          {grantedRoles.length > 0 && (
            <RolePermissionsLink roles={grantedRoles} isCombined={inGroups} />
          )}
        </div>
        <ul className="flex flex-col rounded-lg border px-2 py-1.5">
          {groups.map((group) => (
            <SourceRow
              key={group.key}
              label={
                <GroupName group={group} canEditGroup={canManageOrgGroups} />
              }
            >
              {isEffective(group.role) && <EffectiveMarker />}
              <ReadOnlyRole>{roleName(group.role)}</ReadOnlyRole>
            </SourceRow>
          ))}
          {organizationRole && (
            <SourceRow label="Organization role">
              {!isOrganizationRoleReplaced && isEffective(organizationRole) && (
                <EffectiveMarker />
              )}
              <ReadOnlyRole>{roleName(organizationRole)}</ReadOnlyRole>
            </SourceRow>
          )}
          <SourceRow label="Directly assigned">
            {(!organizationRole || isOrganizationRoleReplaced) &&
              isEffective(effective.direct) && <EffectiveMarker />}
            {editor.disabledReason ? (
              <DisabledActionTooltip label={editor.disabledReason}>
                {directRolePicker}
              </DisabledActionTooltip>
            ) : (
              directRolePicker
            )}
          </SourceRow>
        </ul>
        {hasTriedRoles && isLockedByGroup && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <span className="flex h-lh shrink-0 items-center">
              <InfoIcon size="sm" aria-hidden="true" />
            </span>
            <span>
              {lockNote(
                saved,
                firstName,
                (groupId) =>
                  groups.find((group) => group.groupId === groupId)?.href ??
                  null,
              )}
            </span>
          </p>
        )}
      </section>
    </AccessDialog>
  );
}

export function describeRoleCell(effective: EffectiveRole, onProject: boolean) {
  const tag = sourceTag(effective, onProject);
  const names = effective.roles.map(roleName).join(", ");
  return {
    roles: effective.roles,
    label: `${names}, ${tag}. Open role details`,
    groupHint: raisingGrants(effective).length > 0 ? tag : undefined,
  };
}

export function EffectiveRoleDialogController({
  children,
  ...props
}: EffectiveRoleSourceProps & {
  children: (openDialog: () => void) => React.ReactNode;
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <RoleDialog {...props} onDone={closeDialog} />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}
