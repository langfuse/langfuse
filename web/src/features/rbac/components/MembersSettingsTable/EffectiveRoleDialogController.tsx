import { useState } from "react";
import Link from "next/link";
import { Building, Check, House } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import {
  grantsAccess,
  includesRole,
  resolveEffectiveRoles,
  type AccessLevel,
} from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { DisabledActionTooltip } from "@/src/components/design-system/DisabledActionTooltip/DisabledActionTooltip";
import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { GroupNameLabel } from "@/src/features/groups/components/GroupNameLabel";
import { GroupSummaryCard } from "@/src/features/groups/components/GroupSummaryCard/GroupSummaryCard";
import {
  groupDialogHref,
  projectGroupDialogHref,
} from "@/src/features/groups/groupDialogLink";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { RolePermissionsLink } from "@/src/features/rbac/components/RolePermissionsLink";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
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
    if (!floor || role === floor || !includesRole(floor, role, effective.level))
      return undefined;
    if (allowNone && role === "NONE") return undefined;
    const names = joinNames(
      floorGrants(effective).map((grant) => grant.groupName),
    );
    return `${names} already gives ${roleName(floor)}`;
  };

type GroupReason = MemberGroupRole & {
  key: string;
  levelNote?: string;
  href: string | null;
};

function groupReasons(
  effective: EffectiveRole,
  {
    orgId,
    projectId,
    canSeeOrgGroups,
    canSeeProjectGroups,
  }: {
    orgId: string;
    projectId?: string;
    canSeeOrgGroups: boolean;
    canSeeProjectGroups: boolean;
  },
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
      ...grant,
      key: `${grant.groupId}-${grant.level}`,
      levelNote: levelNote(grant, effective.grants),
      href: groupHref(grant, {
        orgId,
        projectId,
        canSeeOrgGroups,
        canSeeProjectGroups,
      }),
    });
  }
  return reasons;
}

/** A project-level grant opens on the project's Groups page, where its project role is shown. */
function groupHref(
  grant: MemberGroupRole,
  context: {
    orgId: string;
    projectId?: string;
    canSeeOrgGroups: boolean;
    canSeeProjectGroups: boolean;
  },
): string | null {
  if (grant.level === "project" && context.projectId)
    return context.canSeeProjectGroups
      ? projectGroupDialogHref(context.projectId, grant.groupId)
      : null;
  return context.canSeeOrgGroups
    ? groupDialogHref(context.orgId, grant.groupId)
    : null;
}

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
  canSeeOrgGroups: boolean;
  canSeeProjectGroups: boolean;
  member: { name: string | null; email: string | null };
  editor: DirectRoleEditor;
};

function GroupName({ group }: { group: GroupReason }) {
  const label = (
    <>
      <GroupNameLabel name={group.groupName} />
      {group.levelNote && (
        <span className="text-foreground-tertiary shrink-0">
          ({group.levelNote})
        </span>
      )}
    </>
  );
  return (
    <HoverCard
      openDelay={150}
      closeDelay={100}
      placement="bottom"
      content={
        <GroupSummaryCard
          name={group.groupName}
          level={group.level}
          source={group.groupSource}
          role={group.role}
          memberCount={group.memberCount}
          memberPreview={group.memberPreview}
          groupHref={group.href}
        />
      }
    >
      {({ getTriggerProps }) =>
        group.href ? (
          <Link
            href={group.href}
            className="flex min-w-0 items-center gap-1 hover:underline"
            {...getTriggerProps()}
          >
            {label}
          </Link>
        ) : (
          <span
            className="flex min-w-0 items-center gap-1"
            tabIndex={0}
            {...getTriggerProps()}
          >
            {label}
          </span>
        )
      }
    </HoverCard>
  );
}

function SourceRow({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-h-12 items-center justify-between gap-3 px-3 py-1.5">
      <span className="flex min-w-0">{label}</span>
      <span className="flex shrink-0 items-center gap-2">{children}</span>
    </li>
  );
}

function ReadOnlyRole({ role }: { role: Role }) {
  return (
    <span className="inline-flex items-center gap-1 border border-transparent pr-1.5">
      {roleName(role)}
      <span className="invisible inline-flex" aria-hidden="true">
        <DropdownIndicator />
      </span>
    </span>
  );
}

function EffectiveMarker() {
  return (
    <Tooltip label="This role applies">
      {({ getTriggerProps }) => (
        <span
          role="img"
          aria-label="This role applies"
          className="bg-dark-green text-light-green inline-flex size-4 shrink-0 items-center justify-center rounded-full"
          {...getTriggerProps()}
        >
          <Check size="sm" color="inherit" aria-hidden="true" />
        </span>
      )}
    </Tooltip>
  );
}

function lockNote(effective: EffectiveRole, firstName: string) {
  const names = [
    ...new Set(floorGrants(effective).map((grant) => grant.groupName)),
  ];
  const groups = names.length > 1 ? "those groups" : "the group";
  return `Anything below ${roleName(effective.groupFloor ?? effective.role)} has no effect while ${firstName} is in ${names.join(", ")}. To lower it, remove ${firstName} from ${groups}.`;
}

function RoleDialog({
  effective: saved,
  orgRole,
  orgId,
  projectId,
  projectName,
  canSeeOrgGroups,
  canSeeProjectGroups,
  member,
  editor,
  onDone,
}: EffectiveRoleSourceProps & { onDone: () => void }) {
  const onProject = Boolean(projectId);
  const [selected, setSelected] = useState<Role>(editor.value);
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
  const groups = groupReasons(effective, {
    orgId,
    projectId,
    canSeeOrgGroups,
    canSeeProjectGroups,
  });
  const organizationRole = organizationRoleOnProject(orgRole, onProject);
  // A direct project role replaces the organization role on that project.
  const isOrganizationRoleReplaced =
    organizationRole !== null && !effective.directIsOrgDefault;
  const listedRoleCount =
    groups.length + (organizationRole ? 1 : 0) + (selected === "NONE" ? 0 : 1);
  // With a single role listed there is nothing to tell apart.
  const isEffective = (role: Role) =>
    listedRoleCount > 1 && effective.roles.includes(role);
  const displayName = member.name ?? member.email ?? "This member";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const isLockedByGroup = editor.roles.some(
    (role) =>
      belowGroupFloor(saved, { allowNone: editor.isProjectRole })(role) !==
      undefined,
  );

  const picker = (
    <RoleField
      aria-label="Directly assigned role"
      variant="inline"
      roles={editor.roles}
      value={selected}
      onChange={setSelected}
      disabled={editor.disabledReason !== undefined}
      noneDescription={
        editor.isProjectRole ? inheritNoneDescription(orgRole) : undefined
      }
      optionDisabledReason={editor.optionDisabledReason}
    />
  );

  return (
    <Dialog
      noCapture
      icon={onProject ? House : Building}
      title={onProject ? "Project access" : "Organization access"}
      description={[member.email ?? displayName, projectName]
        .filter(Boolean)
        .join(" · ")}
      closeLabel="Cancel"
      actions={[
        {
          label: "Save",
          disabled:
            editor.disabledReason !== undefined || selected === editor.value,
          onClick: () => {
            editor.onChange(selected);
            onDone();
          },
        },
      ]}
    >
      <Dialog.Body separators="both">
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="font-bold">
              {groups.length > 0 ? "Access granted through" : "Access"}
            </h3>
            {effective.role !== "NONE" && (
              <RolePermissionsLink role={effective.role} />
            )}
          </div>
          <ul className="flex flex-col divide-y rounded-lg border">
            {groups.map((group) => (
              <SourceRow key={group.key} label={<GroupName group={group} />}>
                {isEffective(group.role) && <EffectiveMarker />}
                <ReadOnlyRole role={group.role} />
              </SourceRow>
            ))}
            {organizationRole && (
              <SourceRow label="Organization role">
                {!isOrganizationRoleReplaced &&
                  isEffective(organizationRole) && <EffectiveMarker />}
                <ReadOnlyRole role={organizationRole} />
              </SourceRow>
            )}
            <SourceRow label="Directly assigned">
              {(!organizationRole || isOrganizationRoleReplaced) &&
                isEffective(effective.direct) && <EffectiveMarker />}
              {editor.disabledReason ? (
                <DisabledActionTooltip label={editor.disabledReason}>
                  {picker}
                </DisabledActionTooltip>
              ) : (
                picker
              )}
            </SourceRow>
          </ul>
          {isLockedByGroup && (
            <p className="text-muted-foreground text-xs">
              {lockNote(saved, firstName)}
            </p>
          )}
        </section>
      </Dialog.Body>
    </Dialog>
  );
}

export function describeRoleCell(effective: EffectiveRole, onProject: boolean) {
  const tag = sourceTag(effective, onProject);
  const names = effective.roles.map(roleName).join(", ");
  return {
    roles: effective.roles,
    label: `${names}, ${tag}. Open role details`,
    groupHint: groupHint(effective, tag),
  };
}

function groupHint(effective: EffectiveRole, tag: string) {
  if (raisingGrants(effective).length > 0) return tag;
  if (effective.grants.length === 0) return undefined;
  return `Also in ${joinNames(effective.grants.map((grant) => grant.groupName))}`;
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
