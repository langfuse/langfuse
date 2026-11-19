import { useId, useState } from "react";
import { Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const OPTIONS: Role[] = ["NONE", "ADMIN", "MEMBER", "VIEWER"];

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
          : "Applies in every project",
      sources,
      editing: orgRole,
    };
  }
  const projectApplies =
    projectRole !== null && orderedRoles[projectRole] > orderedRoles[orgRole];
  let tag = "No role here";
  if (projectApplies) tag = "Set on this project";
  else if (orgRole !== "NONE") tag = "Inherited from organization";
  const sources: Source[] = [
    {
      key: "organization",
      label: "Organization role",
      role: orgRole,
      status: !projectApplies && orgRole !== "NONE" ? "Highest" : "",
    },
    {
      key: "project",
      label: "Project role",
      role: projectRole,
      status: projectStatus(projectApplies, projectRole),
    },
  ];
  return {
    role: projectApplies && projectRole ? projectRole : orgRole,
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
    return <>{lead} in this organization and every project.</>;
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
  disabledReason,
  onChange,
  onDone,
}: GroupRoleCellProps & { onDone: () => void }) {
  const fieldId = useId();
  const orgRole = orgRoleOrNull ?? "NONE";
  const resolved = resolveGroupRole(level, orgRole, projectRole);
  const [selected, setSelected] = useState<Role>(resolved.editing);
  const onProject = level === "project";
  const roleKind = onProject ? "Project role" : "Organization role";
  const members = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;
  const noEffect =
    onProject &&
    selected !== "NONE" &&
    orgRole !== "NONE" &&
    orderedRoles[selected] <= orderedRoles[orgRole];

  return (
    <Dialog
      title={roleKind}
      description={groupRoleAnswer({
        level,
        groupName,
        members,
        role: resolved.role,
        setHere: onProject && resolved.role !== orgRole,
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
      <Dialog.Body>
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-1.5">
            <p>
              <span className="font-bold">Where it comes from</span>
              {onProject && (
                <span className="text-muted-foreground text-xs">
                  {" "}
                  · the highest role applies
                </span>
              )}
            </p>
            <ul className="flex flex-col divide-y rounded-md border">
              {resolved.sources.map((source) => (
                <li
                  key={source.key}
                  className={`grid grid-cols-[minmax(0,1fr)_8rem_4.5rem] items-center gap-3 px-3 py-2 ${source.status === "Highest" ? "bg-muted font-bold" : ""}`}
                >
                  <span>{source.label}</span>
                  <span
                    className={`flex items-center gap-1.5 ${source.status === "Highest" ? "" : "text-muted-foreground"}`}
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
                    className={`text-right text-xs ${source.status === "Highest" ? "" : "text-muted-foreground"}`}
                  >
                    {source.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="font-bold">
              {roleKind} for {groupName}
            </label>
            {disabledReason ? (
              <p className="text-muted-foreground">{disabledReason}</p>
            ) : (
              <RoleField
                id={fieldId}
                roles={OPTIONS}
                value={selected}
                onChange={setSelected}
                noneLabel={onProject ? "Inherit from organization" : undefined}
                noneDescription={
                  onProject
                    ? `Keep the group's organization role (${roleName(orgRole)}) on this project.`
                    : "The group gives no organization role."
                }
                optionDisabledReason={(role) =>
                  grantableRoles &&
                  role !== "NONE" &&
                  !grantableRoles.includes(role) &&
                  role !== resolved.editing
                    ? "You cannot grant this role"
                    : undefined
                }
              />
            )}
            {noEffect && (
              <p className="text-muted-foreground flex items-start gap-2 text-xs">
                <Lock size="sm" aria-hidden="true" __rawClassName="mt-0.5" />
                <span>
                  Anything at or below <Em>{roleName(orgRole)}</Em> has no
                  effect: <Em>{groupName}</Em> already gives {roleName(orgRole)}{" "}
                  in the organization. Pick a higher role, or inherit from the
                  organization.
                </span>
              </p>
            )}
            {!onProject && !noEffect && (
              <p className="text-muted-foreground text-xs">
                Members keep their own role when it is higher.
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
    role: resolved.role,
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
