import { useId, useState } from "react";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { rolePermissionCountLabel } from "@/src/features/rbac/components/RolePermissionList";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";

type GroupRole = "ADMIN" | "MEMBER" | "VIEWER" | "AI_GATEWAY";

const OPTIONS: Role[] = ["NONE", "ADMIN", "MEMBER", "VIEWER"];

/** Role options for a group here, most permissions first as on Members: AI Gateway is org-wide only, behind its flag. */
const optionsFor = (level: Level, isAiGatewayEnabled: boolean): Role[] =>
  (level === "organization" && isAiGatewayEnabled
    ? [...OPTIONS, "AI_GATEWAY" as Role]
    : OPTIONS
  ).toSorted(byPermissionCount);

/** AI Gateway grants no project permissions, so on a project it counts as no role. */
const onProjectLevel = (role: Role): Role =>
  role === "AI_GATEWAY" ? "NONE" : role;

const roleName = (role: Role) => systemRoleAccessRights[role].name;

function RoleWithIcon({ role }: { role: Role }) {
  const Icon = roleIcons[role];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon size="sm" aria-hidden="true" />
      {roleName(role)}
    </span>
  );
}

type Level = "organization" | "project";

type Source = {
  key: string;
  label: string;
  role: Role | null;
  status: "Highest" | "No effect" | "";
};

function projectStatus(
  projectApplies: boolean,
  projectRole: Role | null,
): Source["status"] {
  if (projectApplies) return "Highest";
  if (projectRole) return "No effect";
  return "";
}

/**
 * What a group gives its members at this level, where it comes from, and the
 * role the dialog edits. Groups only add access, so on a project a role counts
 * only when it is higher than the group's organization role.
 */
function resolveGroupRole(
  level: Level,
  orgRole: Role,
  projectRole: Role | null,
) {
  if (level === "organization") {
    const sources: Source[] = [
      {
        key: "organization",
        label: "Organization role",
        role: orgRole,
        status: "",
      },
    ];
    return {
      role: orgRole,
      tag:
        orgRole === "NONE"
          ? "No organization role"
          : orgRole === "AI_GATEWAY"
            ? "Organization only"
            : "Applies in every project",
      sources,
      editing: orgRole,
    };
  }
  const inherited = onProjectLevel(orgRole);
  const projectApplies =
    projectRole !== null && orderedRoles[projectRole] > orderedRoles[inherited];
  let tag = "No role here";
  if (projectApplies) tag = "Set on this project";
  else if (inherited !== "NONE") tag = "Inherited from organization";
  const sources: Source[] = [
    {
      key: "organization",
      label: "Organization role",
      role: inherited,
      status: !projectApplies && inherited !== "NONE" ? "Highest" : "",
    },
    {
      key: "project",
      label: "Project role",
      role: projectRole,
      status: projectStatus(projectApplies, projectRole),
    },
  ];
  return {
    role: projectApplies && projectRole ? projectRole : inherited,
    tag,
    sources,
    editing: projectRole ?? ("NONE" as Role),
  };
}

type GroupRoleCellProps = {
  /** "organization" edits the group's org-wide role; "project" its role on this project. */
  level: Level;
  groupName: string;
  memberCount: number;
  orgRole: Role | null;
  /** Only used on a project. */
  projectRole?: Role | null;
  /** Roles the current user may grant here. */
  grantableRoles?: Role[];
  /** Offers AI Gateway as an organization role (org level only). */
  isAiGatewayEnabled?: boolean;
  /** Why the role cannot be changed here, if it cannot. */
  disabledReason?: string;
  onChange: (role: GroupRole | null) => void;
};

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground font-bold">{children}</span>
);

/** One sentence on what the group gives its members here, and where it comes from. */
function groupRoleAnswer({
  level,
  groupName,
  members,
  role,
  setHere,
}: {
  level: Level;
  groupName: string;
  members: string;
  role: Role;
  setHere: boolean;
}) {
  const scope =
    level === "project" ? "on this project" : "in this organization";
  if (role === "NONE")
    return (
      <>
        <Em>{groupName}</Em> gives its {members} no role {scope}.
      </>
    );
  const lead = (
    <>
      <Em>{groupName}</Em> gives its {members}{" "}
      <Em>
        <RoleWithIcon role={role} />
      </Em>
    </>
  );
  if (level === "organization")
    return (
      <>
        {lead} in this organization
        {role === "AI_GATEWAY" ? "" : " and every project"}.
      </>
    );
  return (
    <>
      {lead} on this project,{" "}
      {setHere ? "set here" : "inherited from its organization role"}.
    </>
  );
}

function GroupRoleDialog({
  level,
  groupName,
  memberCount,
  orgRole: orgRoleOrNull,
  projectRole = null,
  grantableRoles,
  isAiGatewayEnabled = false,
  disabledReason,
  onChange,
  onDone,
}: GroupRoleCellProps & { onDone: () => void }) {
  const fieldId = useId();
  const orgRole = orgRoleOrNull ?? "NONE";
  const onProject = level === "project";
  // What the org role means at this level: AI Gateway counts as none on a project.
  const levelOrgRole = onProject ? onProjectLevel(orgRole) : orgRole;
  const resolved = resolveGroupRole(level, orgRole, projectRole);
  const [selected, setSelected] = useState<Role>(resolved.editing);
  const roleKind = onProject ? "Project role" : "Organization role";
  const members = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
  const noEffect =
    onProject &&
    selected !== "NONE" &&
    levelOrgRole !== "NONE" &&
    orderedRoles[selected] <= orderedRoles[levelOrgRole];

  return (
    <Dialog
      title={roleKind}
      description={groupRoleAnswer({
        level,
        groupName,
        members,
        role: resolved.role,
        setHere: onProject && resolved.role !== levelOrgRole,
      })}
      closeLabel="Cancel"
      actions={[
        {
          label: "Save",
          disabled:
            disabledReason !== undefined || selected === resolved.editing,
          onClick: () => {
            onChange(selected === "NONE" ? null : (selected as GroupRole));
            onDone();
          },
        },
      ]}
    >
      <Dialog.Body spacing="compact">
        <div className="flex flex-col gap-3 text-sm">
          {/* On a project the group's role can come from its organization
              role or its project role; at organization level there is only
              one source, which the description already names. */}
          {/* Same tag style as the Members dialog: each role the group has
              here, where it is set, and whether it counts. At organization
              level there is only one source, which the description names. */}
          {/* The role the group's members actually get here, as in the
              Members dialog, so the list below reads as its sources. */}
          {onProject && resolved.role !== "NONE" && (
            <div className="flex flex-col rounded-md border">
              <div className="bg-muted text-muted-foreground rounded-t-md border-b px-3 py-2 text-xs">
                Effective role · combined permissions of inherited and project
                roles
              </div>
              <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_6.5rem] items-baseline gap-3 px-3 py-2">
                <span className="font-bold">
                  <RoleWithIcon role={resolved.role} />
                </span>
                <span className="text-muted-foreground">
                  {systemRoleAccessRights[resolved.role].description}
                </span>
                <span className="text-muted-foreground text-right text-xs">
                  {rolePermissionCountLabel(resolved.role)}
                </span>
              </div>
            </div>
          )}

          {onProject &&
            resolved.sources.some(
              (source) => source.role && source.role !== "NONE",
            ) && (
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">
                  Roles {groupName} has on this project
                </p>
                <ul className="flex flex-col divide-y rounded-md border">
                  {resolved.sources
                    .filter((source) => source.role && source.role !== "NONE")
                    .toSorted(
                      (x, y) =>
                        orderedRoles[y.role ?? "NONE"] -
                        orderedRoles[x.role ?? "NONE"],
                    )
                    .map((source) => {
                      const unused = source.status === "No effect";
                      return (
                        <li
                          key={source.key}
                          className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 px-3 py-2"
                        >
                          <span
                            className={`font-bold ${unused ? "text-muted-foreground" : ""}`}
                          >
                            {source.role && <RoleWithIcon role={source.role} />}
                          </span>
                          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                              {source.key === "project"
                                ? "Set on this project"
                                : "Inherited from organization"}
                            </span>
                            {unused && (
                              <span className="text-muted-foreground text-xs">
                                {source.role === levelOrgRole
                                  ? "same as inherited"
                                  : `${roleName(levelOrgRole)} is higher, so this has no effect`}
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}

          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="font-bold">
              {roleKind} for {groupName}
            </label>
            {disabledReason ? (
              <p className="text-muted-foreground">{disabledReason}</p>
            ) : (
              <RoleField
                id={fieldId}
                roles={optionsFor(level, isAiGatewayEnabled)}
                value={selected}
                onChange={setSelected}
                noneLabel={onProject ? "Inherit from organization" : undefined}
                noneDescription={
                  onProject
                    ? `Keep the group's organization role (${roleName(levelOrgRole)}) on this project.`
                    : "The group gives no organization role."
                }
                optionDisabledReason={(role) => {
                  if (
                    grantableRoles &&
                    role !== "NONE" &&
                    !grantableRoles.includes(role) &&
                    role !== resolved.editing
                  )
                    return "You cannot grant this role";
                  // On a project, a role at or below the group's organization
                  // role adds nothing, as on the Members page.
                  if (
                    onProject &&
                    role !== "NONE" &&
                    levelOrgRole !== "NONE" &&
                    orderedRoles[role] <= orderedRoles[levelOrgRole]
                  )
                    return `No effect: ${groupName} already gives ${roleName(levelOrgRole)} in the organization`;
                  return undefined;
                }}
              />
            )}
            {!onProject && !noEffect && (
              <p className="text-muted-foreground text-xs">
                {selected === "AI_GATEWAY"
                  ? "Members keep their own role and also get AI Gateway access."
                  : "Members keep their own role when it is higher."}
              </p>
            )}
          </div>
        </div>
      </Dialog.Body>
    </Dialog>
  );
}

/** What a groups table role cell shows: the role the group gives at this level. */
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

/**
 * Opens the role dialog behind a groups table role cell, the same dialog as
 * the members tables. The caller renders the trigger.
 */
export function GroupRoleDialogController({
  children,
  ...props
}: GroupRoleCellProps & {
  children: (openDialog: () => void) => React.ReactNode;
}) {
  return (
    <DialogController
      renderDialog={({ closeDialog }) => (
        <GroupRoleDialog {...props} onDone={closeDialog} />
      )}
    >
      {({ openDialog }) => children(() => openDialog())}
    </DialogController>
  );
}
