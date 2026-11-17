import { useId } from "react";
import Link from "next/link";
import { ChevronDown, Lock } from "@langfuse/icons";
import { projectRoleAccessRights, type Role } from "@langfuse/shared";
import {
  organizationRoleAccessRights,
  systemRoleAccessRights,
} from "@langfuse/shared/rbac";

import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { type MemberGroupRole } from "./MembersSettingsTable";

const roleName = (role: Role) => systemRoleAccessRights[role].name;

const higher = (a: Role, b: Role) =>
  orderedRoles[b] > orderedRoles[a] ? b : a;

const joinNames = (names: string[]) => [...new Set(names)].join(", ");

export type EffectiveRole = {
  /** The highest role among the direct role and every group grant. */
  role: Role;
  /**
   * True when the permissions add up to more than `role` alone, e.g. AI
   * Gateway plus Viewer.
   */
  mixed: boolean;
  /** The member's direct role: the org role, or on a project the project role or its org default. */
  direct: Role;
  /** On a project page: the member has no project role and inherits the org role. */
  directIsOrgDefault: boolean;
  /** The highest role any group grants here; lower roles cannot be picked. */
  groupFloor: Role | null;
  /** Group grants that apply at this level, highest first. */
  grants: MemberGroupRole[];
};

/**
 * Effective role of a member. On the organization page only org-wide group
 * grants count; on a project page the project role (or the org role when the
 * project has none) combines with org-wide and project group grants, matching
 * `resolveOrganizationScopes` and `resolveProjectScopes` on the server.
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
  const grants = groupRoles
    .filter((grant) => level === "project" || grant.level === "organization")
    .toSorted((a, b) => orderedRoles[b.role] - orderedRoles[a.role]);
  const directIsOrgDefault = level === "project" && projectRole === undefined;
  const direct = level === "project" ? (projectRole ?? orgRole) : orgRole;
  const groupFloor = grants[0]?.role ?? null;
  const role = groupFloor ? higher(direct, groupFloor) : direct;

  const scopesOf = (r: Role): readonly string[] =>
    level === "project"
      ? projectRoleAccessRights[r]
      : organizationRoleAccessRights[r];
  const effectiveScopes = new Set(scopesOf(role));
  const mixed = [direct, ...grants.map((grant) => grant.role)].some((r) =>
    scopesOf(r).some((scope) => !effectiveScopes.has(scope)),
  );

  return { role, mixed, direct, directIsOrgDefault, groupFloor, grants };
}

/** The grants that set the group floor, i.e. the groups that lock lower roles. */
const floorGrants = (effective: EffectiveRole) =>
  effective.grants.filter((grant) => grant.role === effective.groupFloor);

/** Why a direct role cannot be picked because a group already grants more. */
export const belowGroupFloor =
  (effective: EffectiveRole, { allowNone }: { allowNone: boolean }) =>
  (role: Role) => {
    const floor = effective.groupFloor;
    if (!floor || orderedRoles[role] >= orderedRoles[floor]) return undefined;
    if (allowNone && role === "NONE") return undefined;
    return `${joinNames(floorGrants(effective).map((grant) => grant.groupName))} grants ${roleName(floor)}`;
  };

/**
 * One place a member's access comes from. With custom roles a source can hold
 * several roles and the member gets the union of their permissions; today each
 * source holds one role on the ladder and the highest one applies.
 */
type RoleSource = {
  key: string;
  label: string;
  /** `null` when the source sets no role here, e.g. a project role that is not set. */
  role: Role | null;
  scim: boolean;
  href?: string;
  status: "applies" | "lower" | "unused" | "unset";
};

function roleSources(
  effective: EffectiveRole,
  {
    orgRole,
    orgId,
    projectId,
  }: { orgRole: Role; orgId: string; projectId?: string },
): RoleSource[] {
  let decided = false;
  const statusOf = (role: Role): RoleSource["status"] => {
    if (!decided && role === effective.role) {
      decided = true;
      return "applies";
    }
    return "lower";
  };
  const groups = effective.grants.map((grant): RoleSource => ({
    key: `${grant.groupId}-${grant.level}`,
    label: grant.groupName,
    role: grant.role,
    scim: grant.groupSource === "SCIM",
    href:
      grant.level === "project" && projectId
        ? `/project/${projectId}/settings/groups`
        : `/organization/${orgId}/settings/groups`,
    status: "lower",
  }));
  if (!projectId) {
    const direct: RoleSource = {
      key: "direct",
      label: "Set directly",
      role: orgRole,
      scim: false,
      status: statusOf(orgRole),
    };
    return [
      direct,
      ...groups.map((g) => ({ ...g, status: statusOf(g.role!) })),
    ];
  }
  const inherits = effective.directIsOrgDefault;
  const organization: RoleSource = {
    key: "organization",
    label: "Organization",
    role: orgRole,
    scim: false,
    status: inherits ? statusOf(orgRole) : "unused",
  };
  const project: RoleSource = {
    key: "project",
    label: "This project",
    role: inherits ? null : effective.direct,
    scim: false,
    status: inherits ? "unset" : statusOf(effective.direct),
  };
  return [
    organization,
    project,
    ...groups.map((g) => ({ ...g, status: statusOf(g.role!) })),
  ];
}

/** Why the member has this role, as a short tag: "From Platform Admins", "Inherited from organization"… */
function sourceTag(effective: EffectiveRole, onProject: boolean) {
  const { role, mixed, direct, directIsOrgDefault, grants } = effective;
  const raising = grants.filter((grant) => mixed || grant.role === role);
  if (mixed || role !== direct) {
    return {
      text: `From ${joinNames(raising.map((grant) => grant.groupName))}`,
      scim: raising.some((grant) => grant.groupSource === "SCIM"),
    };
  }
  if (directIsOrgDefault)
    return { text: "Inherited from organization", scim: false };
  return {
    text: onProject ? "Set on this project" : "Set directly",
    scim: false,
  };
}

/** One line on how to lower access a group locks: in the IdP for SCIM groups, on the Groups page otherwise. */
function unlockHint(effective: EffectiveRole) {
  const grants = floorGrants(effective);
  const names = joinNames(grants.map((grant) => grant.groupName));
  const where = grants.every((grant) => grant.groupSource === "SCIM")
    ? "in your identity provider"
    : "on the Groups page";
  return `Locked by ${names}. Change it ${where}.`;
}

const STATUS_LABEL: Record<RoleSource["status"], string> = {
  applies: "Applies",
  lower: "Lower",
  unused: "Not used",
  unset: "",
};

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

function RoleWithIcon({ role, label }: { role: Role; label?: string }) {
  const Icon = roleIcons[role];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size="sm" aria-hidden="true" />
      {label ?? roleName(role)}
    </span>
  );
}

/**
 * The single role cell of the members table: the effective role with a short
 * tag saying where it comes from. Clicking it lists every source and lets
 * admins change the member's own role.
 */
export function EffectiveRoleSource({
  effective,
  orgRole,
  orgId,
  projectId,
  canSeeOrgSettings,
  editor,
}: {
  effective: EffectiveRole;
  orgRole: Role;
  orgId: string;
  projectId?: string;
  canSeeOrgSettings: boolean;
  editor: DirectRoleEditor;
}) {
  const editorId = useId();
  const onProject = Boolean(projectId);
  const sources = roleSources(effective, { orgRole, orgId, projectId });
  const fromGroup = effective.mixed || effective.role !== effective.direct;
  const roleLabel = effective.mixed
    ? [
        ...new Set([
          effective.direct,
          ...effective.grants.map((grant) => grant.role),
        ]),
      ]
        .map(roleName)
        .join(" + ")
    : roleName(effective.role);
  const tag = sourceTag(effective, onProject);
  const tagChip = (
    <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
      {tag.scim && <Lock size="sm" aria-hidden="true" />}
      {tag.text}
    </span>
  );

  return (
    <HoverCard
      interaction="click"
      placement="bottom-start"
      content={
        <div className="flex w-80 flex-col gap-3 p-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              <RoleWithIcon role={effective.role} label={roleLabel} />
            </span>
            {tagChip}
          </div>

          <ul className="flex flex-col divide-y border-y">
            {sources.map((source) => (
              <li
                key={source.key}
                className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] items-center gap-2 py-2"
              >
                <span className="flex min-w-0 items-center gap-1">
                  {source.scim && (
                    <Lock
                      size="sm"
                      aria-label="Synced from your identity provider"
                    />
                  )}
                  {source.href ? (
                    <Link
                      href={source.href}
                      className="truncate underline"
                      title={source.label}
                    >
                      {source.label}
                    </Link>
                  ) : (
                    <span className="truncate" title={source.label}>
                      {source.label}
                    </span>
                  )}
                </span>
                <span
                  className={
                    source.status === "applies"
                      ? "font-bold"
                      : "text-muted-foreground"
                  }
                >
                  {source.role ? (
                    <RoleWithIcon role={source.role} />
                  ) : (
                    "Not set"
                  )}
                </span>
                <span className="text-muted-foreground text-right">
                  {STATUS_LABEL[source.status]}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2">
            <p id={editorId} className="font-bold">
              {editor.isProjectRole ? "Project role" : "Organization role"}
            </p>
            {editor.disabledReason ? (
              <p className="text-muted-foreground">{editor.disabledReason}</p>
            ) : (
              <div role="group" aria-labelledby={editorId}>
                <RadioGroup
                  value={editor.value}
                  onValueChange={(value) => editor.onChange(value as Role)}
                >
                  {editor.roles.map((role) => {
                    const reason = editor.optionDisabledReason(role);
                    const optionId = `${editorId}-${role}`;
                    return (
                      <label
                        key={role}
                        htmlFor={optionId}
                        title={reason}
                        className={`flex items-center gap-2 ${reason ? "text-muted-foreground" : ""}`}
                      >
                        <RadioGroup.Item
                          id={optionId}
                          value={role}
                          disabled={reason !== undefined}
                        />
                        <RoleWithIcon
                          role={role}
                          label={
                            role === "NONE" && editor.isProjectRole
                              ? "Inherit from organization"
                              : undefined
                          }
                        />
                        {reason && (
                          <Lock size="sm" aria-label={`Locked: ${reason}`} />
                        )}
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
            {fromGroup && (
              <p className="text-muted-foreground">{unlockHint(effective)}</p>
            )}
          </div>

          {onProject && canSeeOrgSettings && (
            <Link
              href={`/organization/${orgId}/settings/members`}
              className="underline"
            >
              Open organization members
            </Link>
          )}
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          className="hover:bg-muted inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs"
          aria-label={`${roleLabel}, ${tag.text}. Show where this role comes from`}
          {...getTriggerProps()}
        >
          <span className="shrink-0 font-bold">
            <RoleWithIcon role={effective.role} label={roleLabel} />
          </span>
          <span className="min-w-0 truncate" title={tag.text}>
            {tagChip}
          </span>
          <ChevronDown size="sm" aria-hidden="true" />
        </button>
      )}
    </HoverCard>
  );
}
