import { useId, useState } from "react";
import Link from "next/link";
import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RoleField } from "@/src/features/rbac/components/RoleField";
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
 * `resolveOrganizationScopes` and `resolveProjectScopes` on the server. Only the
 * highest role is shown; roles outside the ladder (AI Gateway) are not merged.
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

  return { role, direct, directIsOrgDefault, groupFloor, grants };
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
    const names = joinNames(
      floorGrants(effective).map((grant) => grant.groupName),
    );
    return `Can't go below ${roleName(floor)}: ${names} already gives ${roleName(floor)}, and groups only add access`;
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
      label: "Directly assigned",
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
    label: "Organization role",
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
  const { role, direct, directIsOrgDefault, grants } = effective;
  const raising = grants.filter((grant) => grant.role === role);
  if (role !== direct) {
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

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground font-bold">{children}</span>
);

const listFormat = new Intl.ListFormat("en", { type: "conjunction" });

/** One sentence on why the member has this role, for the top of the dialog. */
function roleAnswer(
  effective: EffectiveRole,
  { fullName, scopeLabel }: { fullName: string; scopeLabel: string },
) {
  const lead = (
    <>
      {fullName} is{" "}
      <Em>
        <RoleWithIcon role={effective.role} />
      </Em>{" "}
      {scopeLabel}
    </>
  );
  if (effective.role !== effective.direct) {
    const raising = effective.grants.filter(
      (grant) => grant.role === effective.role,
    );
    const names = [...new Set(raising.map((grant) => grant.groupName))];
    return (
      <>
        {lead} through the {names.length > 1 ? "groups" : "group"}{" "}
        <Em>{listFormat.format(names)}</Em>.
      </>
    );
  }
  if (effective.directIsOrgDefault)
    return <>{lead}, inherited from the organization.</>;
  return (
    <>
      {lead},{" "}
      {scopeLabel === "on this project" ? "set here" : "assigned directly"}.
    </>
  );
}

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

const STATUS_LABEL: Record<RoleSource["status"], string> = {
  applies: "Highest",
  lower: "",
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
  member: MemberIdentity;
  editor: DirectRoleEditor;
};

/** The source row's name: a link to the group, with a lock for SCIM groups. */
function SourceLabel({ source }: { source: RoleSource }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      {source.scim && (
        <Lock size="sm" aria-label="Synced from your identity provider" />
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
  );
}

/**
 * The dialog behind the role cell: a one-sentence answer, the sources with the
 * highest one marked, and the member's own role to change.
 */
function RoleDialog({
  effective,
  orgRole,
  orgId,
  projectId,
  canSeeOrgSettings,
  member,
  editor,
  onDone,
}: EffectiveRoleSourceProps & { onDone: () => void }) {
  const fieldId = useId();
  const onProject = Boolean(projectId);
  const [selected, setSelected] = useState<Role>(editor.value);
  const sources = roleSources(effective, { orgRole, orgId, projectId });
  const fromGroup = effective.role !== effective.direct;
  const displayName = member.name ?? member.email ?? "this member";
  const firstName = displayName.split(" ")[0] ?? displayName;
  const scopeLabel = onProject ? "on this project" : "in this organization";
  const roleKind = editor.isProjectRole ? "Project role" : "Organization role";

  return (
    <Dialog
      title={roleKind}
      description={roleAnswer(effective, { fullName: displayName, scopeLabel })}
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
      <Dialog.Body>
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-1.5">
            <p>
              <span className="font-bold">Where it comes from</span>
              {sources.length > 1 && (
                <span className="text-muted-foreground text-xs">
                  {" "}
                  · the highest role applies
                </span>
              )}
            </p>
            <ul className="flex flex-col divide-y rounded-md border">
              {sources.map((source) => (
                <li
                  key={source.key}
                  className={`grid grid-cols-[minmax(0,1fr)_8rem_4.5rem] items-center gap-3 px-3 py-2 ${source.status === "applies" ? "bg-muted font-bold" : ""}`}
                >
                  <SourceLabel source={source} />
                  <span
                    className={`flex items-center gap-1.5 ${source.status === "applies" ? "" : "text-muted-foreground"}`}
                  >
                    {source.role ? (
                      <RoleWithIcon role={source.role} />
                    ) : (
                      <>
                        <Lock
                          size="sm"
                          aria-hidden="true"
                          __rawClassName="invisible"
                        />
                        Not set
                      </>
                    )}
                  </span>
                  <span
                    className={`text-right text-xs ${source.status === "applies" ? "" : "text-muted-foreground"}`}
                  >
                    {STATUS_LABEL[source.status]}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
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
                    ? `Keep the organization role (${roleName(orgRole)}) on this project.`
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

/** What the role cell shows: the role, and a hint when a group sets it. */
export function describeRoleCell(effective: EffectiveRole, onProject: boolean) {
  const tag = sourceTag(effective, onProject);
  const fromGroup = effective.role !== effective.direct;
  return {
    role: effective.role,
    label: `${roleName(effective.role)}, ${tag.text}. Open role details`,
    groupHint: fromGroup ? tag.text : undefined,
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
