import { useId, useState } from "react";
import Link from "next/link";
import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import {
  organizationRoleAccessRights,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";
import { type MemberGroupRole } from "./MembersSettingsTable";

const roleName = (role: Role) => systemRoleAccessRights[role].name;

const higher = (a: Role, b: Role) =>
  orderedRoles[b] > orderedRoles[a] ? b : a;

const joinNames = (names: string[]) => [...new Set(names)].join(", ");

/** Roles that rank against each other; a higher one includes a lower one. */
const LADDER: ReadonlySet<Role> = new Set<Role>([
  "OWNER",
  "ADMIN",
  "MEMBER",
  "VIEWER",
]);
const onLadder = (role: Role) => LADDER.has(role);

/** Whether AI Gateway grants something `role` does not already include. */
const gatewayAddsTo = (role: Role) => {
  const scopes = new Set<string>(organizationRoleAccessRights[role]);
  return organizationRoleAccessRights.AI_GATEWAY.some(
    (scope) => !scopes.has(scope),
  );
};

export type EffectiveRole = {
  /**
   * Every role the member effectively has here: the highest ladder role (if
   * any) plus AI Gateway when a source grants it and the ladder role does not
   * already include its permissions. `["NONE"]` when nothing applies.
   */
  roles: Role[];
  /** The highest ladder role among the direct role and every group grant; NONE if none. */
  role: Role;
  /** The highest ladder role is granted by a group and is higher than the direct role. */
  raisedByGroup: boolean;
  /** The member's direct role: the org role, or on a project the project role or its org default. */
  direct: Role;
  /** On a project page: the member has no project role and inherits the org role. */
  directIsOrgDefault: boolean;
  /** The highest ladder role any group grants here; lower ladder roles cannot be picked. */
  groupFloor: Role | null;
  /** Group grants that apply at this level, highest first. */
  grants: MemberGroupRole[];
};

/**
 * Effective roles of a member. On the organization page only org-wide group
 * grants count; on a project page the project role (or the org role when the
 * project has none) combines with org-wide and project group grants, matching
 * `resolveOrganizationScopes` and `resolveProjectScopes` on the server, which
 * union the permissions. Ladder roles (Owner > Admin > Member > Viewer) collapse
 * to the highest one; AI Gateway is kept alongside only when it adds
 * permissions that role lacks (Viewer, for instance, cannot invoke the gateway).
 */
export function resolveEffectiveRole({
  orgRole,
  projectRole,
  groupRoles,
  level,
}: {
  orgRole: Role;
  projectRole?: Role;
  groupRoles: MemberGroupRole[];
  level: "organization" | "project";
}): EffectiveRole {
  const onProject = level === "project";
  // AI Gateway has no project permissions, so on a project it counts as no role.
  const atLevel = (role: Role): Role =>
    onProject && role === "AI_GATEWAY" ? "NONE" : role;
  const grants = groupRoles
    .filter((grant) => onProject || grant.level === "organization")
    .filter((grant) => atLevel(grant.role) !== "NONE")
    .toSorted((a, b) => orderedRoles[b.role] - orderedRoles[a.role]);
  const directIsOrgDefault = onProject && projectRole === undefined;
  const direct = atLevel(onProject ? (projectRole ?? orgRole) : orgRole);
  const ladderDirect: Role = onLadder(direct) ? direct : "NONE";
  const groupFloor = grants.find((grant) => onLadder(grant.role))?.role ?? null;
  const role = groupFloor ? higher(ladderDirect, groupFloor) : ladderDirect;
  const raisedByGroup = role !== ladderDirect;
  const hasGateway =
    (direct === "AI_GATEWAY" ||
      grants.some((grant) => grant.role === "AI_GATEWAY")) &&
    gatewayAddsTo(role);
  const roles: Role[] = [
    ...(role !== "NONE" ? [role] : []),
    ...(hasGateway ? (["AI_GATEWAY"] as Role[]) : []),
  ].toSorted(byPermissionCount);

  return {
    roles: roles.length > 0 ? roles : ["NONE"],
    role,
    raisedByGroup,
    direct,
    directIsOrgDefault,
    groupFloor,
    grants,
  };
}

/** The grants that set the group floor, i.e. the groups that lock lower roles. */
const floorGrants = (effective: EffectiveRole) =>
  effective.grants.filter((grant) => grant.role === effective.groupFloor);

/** Why a direct role cannot be picked because a group already grants more. */
export const belowGroupFloor =
  (effective: EffectiveRole, { allowNone }: { allowNone: boolean }) =>
  (role: Role) => {
    const floor = effective.groupFloor;
    // AI Gateway sits beside the ladder: picking it keeps the group's role and
    // adds gateway access, so a group never locks it.
    if (
      !floor ||
      role === "AI_GATEWAY" ||
      orderedRoles[role] >= orderedRoles[floor]
    )
      return undefined;
    if (allowNone && role === "NONE") return undefined;
    const names = joinNames(
      floorGrants(effective).map((grant) => grant.groupName),
    );
    return `Can't go below ${roleName(floor)}: ${names} already gives ${roleName(floor)}, and groups only add access`;
  };

/** One reason a member holds a role here: a direct assignment, the org role, or a group. */
type RoleReason = {
  key: string;
  label: string;
  /** The group behind this reason, to list each group once per role. */
  groupId?: string;
  /** "org" or "project" when the same group grants different roles at the two levels. */
  levelNote?: string;
  /** The reason is a group; it is linked and marked when synced from SCIM. */
  group: boolean;
  scim: boolean;
  href?: string;
};

/** A role the member holds here and every reason that grants it. */
export type HeldRole = {
  role: Role;
  reasons: RoleReason[];
};

/**
 * The roles a member holds at this level, most permissions first, each with the reasons
 * that grant it. NONE grants nothing, so it never appears. On a project a set
 * project role replaces the organization role, which is then left out too.
 */
export function heldRoles(
  effective: EffectiveRole,
  {
    orgRole,
    orgId,
    projectId,
  }: { orgRole: Role; orgId: string; projectId?: string },
): HeldRole[] {
  const direct: { role: Role; reason: RoleReason } = (() => {
    if (!projectId)
      return {
        role: orgRole,
        reason: {
          key: "direct",
          label: "set below",
          group: false,
          scim: false,
        },
      };
    if (effective.directIsOrgDefault)
      return {
        role: effective.direct,
        reason: {
          key: "organization",
          label: "from the organization role",
          group: false,
          scim: false,
        },
      };
    return {
      role: effective.direct,
      reason: {
        key: "project",
        label: "set below",
        group: false,
        scim: false,
      },
    };
  })();
  const entries: { role: Role; reason: RoleReason }[] = [
    ...(direct.role !== "NONE" ? [direct] : []),
    ...effective.grants.map((grant) => ({
      role: grant.role,
      reason: {
        key: `${grant.groupId}-${grant.level}`,
        label: grant.groupName,
        groupId: grant.groupId,
        levelNote: effective.grants.some(
          (other) =>
            other.groupId === grant.groupId &&
            other.level !== grant.level &&
            other.role !== grant.role,
        )
          ? grant.level === "project"
            ? "project"
            : "org"
          : undefined,
        group: true,
        scim: grant.groupSource === "SCIM",
        href:
          grant.level === "project" && projectId
            ? `/project/${projectId}/settings/groups`
            : `/organization/${orgId}/settings/groups`,
      },
    })),
  ];
  const byRole = new Map<Role, RoleReason[]>();
  for (const { role, reason } of entries) {
    const existing = byRole.get(role) ?? [];
    if (
      reason.groupId &&
      existing.some((other) => other.groupId === reason.groupId)
    )
      continue;
    byRole.set(role, [...existing, reason]);
  }
  return [...byRole.entries()]
    .map(([role, reasons]) => ({ role, reasons }))
    .toSorted((a, b) => byPermissionCount(a.role, b.role));
}

/**
 * What the list leaves out and why: on a project, the organization role when a
 * project role replaces it or when it is None.
 */
function omittedNote(
  effective: EffectiveRole,
  { orgRole, projectId }: { orgRole: Role; projectId?: string },
) {
  if (!projectId) return null;
  // A set project role replaces the org role; a None or AI Gateway org role
  // gives nothing on a project either way, so there is nothing to explain.
  if (
    !effective.directIsOrgDefault &&
    (orgRole === "NONE" || orgRole === "AI_GATEWAY")
  )
    return null;
  if (orgRole === "AI_GATEWAY")
    return "Organization role is AI Gateway, which gives no project access.";
  if (!effective.directIsOrgDefault && orgRole !== "NONE")
    return `Organization role (${roleName(orgRole)}) doesn't apply here because a project role is set.`;
  if (orgRole === "NONE")
    return "Organization role is None, so it adds nothing here.";
  return null;
}

/** Group grants that give the member an effective role their direct role lacks. */
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

/** Why the member has this role, as a short tag: "From Platform Admins", "Inherited from organization"… */
function sourceTag(effective: EffectiveRole, onProject: boolean) {
  const raising = raisingGrants(effective);
  if (raising.length > 0) {
    return {
      text: `From ${joinNames(raising.map((grant) => grant.groupName))}`,
      scim: raising.some((grant) => grant.groupSource === "SCIM"),
    };
  }
  if (effective.directIsOrgDefault)
    return { text: "Inherited from organization", scim: false };
  return {
    text: onProject ? "Set on this project" : "Set directly",
    scim: false,
  };
}

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground font-bold">{children}</span>
);

/** How to lower access a group locks: remove the member from that group. */
function lockNote(effective: EffectiveRole, firstName: string) {
  const names = joinNames(
    floorGrants(effective).map((grant) => grant.groupName),
  );
  return (
    <>
      Anything below <Em>{roleName(effective.groupFloor ?? effective.role)}</Em>{" "}
      has no effect while {firstName} is in <Em>{names}</Em>. To lower it,
      remove {firstName} from the group.
    </>
  );
}

export type DirectRoleEditor = {
  roles: Role[];
  value: Role;
  isProjectRole: boolean;
  /** Why the whole editor is read-only, if it is. */
  disabledReason?: string;
  /** Why a single option cannot be picked, if it cannot. */
  optionDisabledReason: (role: Role) => string | undefined;
  onChange: (role: Role) => void;
};

function RoleWithIcon({ role }: { role: Role }) {
  const Icon = roleIcons[role];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size="sm" aria-hidden="true" />
      {roleName(role)}
    </span>
  );
}

type MemberIdentity = {
  name: string | null;
  email: string | null;
  image: string | null;
};

type EffectiveRoleSourceProps = {
  effective: EffectiveRole;
  orgRole: Role;
  orgId: string;
  projectId?: string;
  canSeeOrgSettings: boolean;
  /** Groups can grant roles here, so the effective role mentions them. */
  isGroupsEnabled: boolean;
  member: MemberIdentity;
  editor: DirectRoleEditor;
};

/** A small tag that says what kind of source a role comes from. */
function SourceTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs">
      {children}
    </span>
  );
}

/**
 * Where a role comes from, tagged so direct and group roles read apart at a
 * glance: "Direct", "Inherited" (from the organization role on a project), or
 * "Group" with the group names as links.
 */
function ReasonList({ reasons }: { reasons: RoleReason[] }) {
  const direct = reasons.filter((reason) => !reason.group);
  const groups = reasons.filter((reason) => reason.group);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      {direct.map((reason) => (
        <span key={reason.key} className="flex items-baseline gap-2">
          <SourceTag>
            {reason.key === "organization" ? "Inherited" : "Direct"}
          </SourceTag>
        </span>
      ))}
      {groups.length > 0 && (
        <span className="flex min-w-0 items-baseline gap-2">
          <SourceTag>{groups.length > 1 ? "Groups" : "Group"}</SourceTag>
          <span className="min-w-0">
            {groups.map((reason, index) => (
              <span key={reason.key}>
                {index > 0 && <span className="text-muted-foreground">, </span>}
                <Link
                  href={reason.href ?? "#"}
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {reason.scim && (
                    <Lock
                      size="sm"
                      aria-label="Synced from your identity provider"
                    />
                  )}
                  {reason.label}
                </Link>
                {reason.levelNote && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({reason.levelNote})
                  </span>
                )}
              </span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * The dialog behind the role cell: the effective role, every role the member
 * holds here with the reasons that grant it (most permissions first), and the member's
 * own role to change.
 */
function RoleDialog({
  effective,
  orgRole,
  orgId,
  projectId,
  canSeeOrgSettings,
  isGroupsEnabled,
  member,
  editor,
  onDone,
}: EffectiveRoleSourceProps & { onDone: () => void }) {
  const fieldId = useId();
  const onProject = Boolean(projectId);
  const [selected, setSelected] = useState<Role>(editor.value);
  const held = heldRoles(effective, { orgRole, orgId, projectId });
  const omitted = omittedNote(effective, { orgRole, projectId });
  const fromGroup = effective.raisedByGroup;
  const displayName = member.name ?? member.email ?? "this member";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const scopeLabel = onProject ? "on this project" : "in this organization";
  const roleKind = editor.isProjectRole ? "Project role" : "Organization role";

  return (
    <Dialog
      title={roleKind}
      description={`${displayName} ${scopeLabel}`}
      size="default"
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
      <Dialog.Body spacing="compact">
        <div className="flex flex-col gap-3 text-sm">
          {held.length > 0 && (
            <div className="flex flex-col rounded-md border">
              <div className="bg-muted text-muted-foreground rounded-t-md border-b px-3 py-2 text-xs">
                Effective role ·{" "}
                {isGroupsEnabled
                  ? "combined permissions of direct and group roles"
                  : "permissions of the role assigned directly"}
              </div>
              <ul className="flex flex-col divide-y">
                {effective.roles.map((role) => (
                  <li
                    key={role}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)_6.5rem] items-baseline gap-3 px-3 py-2"
                  >
                    <span className="font-bold">
                      <RoleWithIcon role={role} />
                    </span>
                    <span className="text-muted-foreground">
                      {systemRoleAccessRights[role].description}
                    </span>
                    <span className="text-muted-foreground text-right text-xs">
                      {role !== "NONE" && rolePermissionCountLabel(role)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {held.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs">
                Roles {firstName} holds {scopeLabel}
              </p>
              <ul className="flex flex-col divide-y rounded-md border">
                {held.map(({ role, reasons }) => (
                  <li
                    key={role}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 px-3 py-2"
                  >
                    <span className="font-bold">
                      <RoleWithIcon role={role} />
                    </span>
                    <ReasonList reasons={reasons} />
                  </li>
                ))}
              </ul>
              {omitted && (
                <p className="text-muted-foreground text-xs">{omitted}</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="font-bold">
              Direct {roleKind.toLowerCase()} for {firstName}
            </label>
            {editor.disabledReason ? (
              <p className="text-muted-foreground">{editor.disabledReason}</p>
            ) : (
              <RoleField
                id={fieldId}
                roles={editor.roles}
                value={selected}
                onChange={setSelected}
                noneLabel={
                  editor.isProjectRole ? "Inherit from organization" : undefined
                }
                noneDescription={
                  editor.isProjectRole
                    ? orgRole === "AI_GATEWAY" || orgRole === "NONE"
                      ? `No project access: the organization role (${roleName(orgRole)}) gives none.`
                      : `Keep the organization role (${roleName(orgRole)}) on this project.`
                    : undefined
                }
                optionDisabledReason={editor.optionDisabledReason}
              />
            )}
            {fromGroup && (
              <p className="text-muted-foreground flex items-start gap-2 text-xs">
                <Lock size="sm" aria-hidden="true" __rawClassName="mt-0.5" />
                <span>{lockNote(effective, firstName)}</span>
              </p>
            )}
          </div>

          {onProject && canSeeOrgSettings && (
            <Link
              href={`/organization/${orgId}/settings/members`}
              className="text-muted-foreground w-fit text-xs underline"
            >
              Open organization members
            </Link>
          )}
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

/** What the role cell shows: every effective role, and a hint when a group raises it. */
export function describeRoleCell(effective: EffectiveRole, onProject: boolean) {
  const tag = sourceTag(effective, onProject);
  const names = effective.roles.map(roleName).join(", ");
  return {
    roles: effective.roles,
    label: `${names}, ${tag.text}. Open role details`,
    groupHint: raisingGrants(effective).length > 0 ? tag.text : undefined,
  };
}

/**
 * Opens the role dialog behind a members table role cell: every source of the
 * role and the member's own role to change. The caller renders the trigger.
 */
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
