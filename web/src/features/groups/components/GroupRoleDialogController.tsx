import { useId, useState } from "react";
import { type Role } from "@langfuse/shared";
import { grantsAccess, includesRole } from "@langfuse/shared/rbac";

import { Dialog } from "@/src/components/design-system/Dialog/Dialog";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { memberCountLabel } from "@/src/features/groups/components/GroupMemberStack";
import { EffectiveRoleCard } from "@/src/features/rbac/components/EffectiveRoleCard";
import { RoleField } from "@/src/features/rbac/components/RoleField";
import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { RoleWithIcon } from "@/src/features/rbac/components/RoleWithIcon";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";

type GroupRole = "ADMIN" | "MEMBER" | "VIEWER" | "AI_GATEWAY";

type Level = "organization" | "project";

const OPTIONS: Role[] = ["NONE", "ADMIN", "MEMBER", "VIEWER"];

const optionsFor = (level: Level, isAiGatewayEnabled: boolean): Role[] =>
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

type GroupRoleCellProps = {
  level: Level;
  groupName: string;
  memberCount: number;
  orgRole: Role | null;
  projectRole?: Role | null;
  grantableRoles?: Role[];
  isAiGatewayEnabled?: boolean;
  disabledReason?: string;
  onChange: (role: GroupRole | null) => void;
};

const Em = ({ children }: { children: React.ReactNode }) => (
  <span className="text-foreground font-bold">{children}</span>
);

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
  const levelOrgRole = onProject ? onProjectLevel(orgRole) : orgRole;
  const resolved = resolveGroupRole(level, orgRole, projectRole);
  const [selected, setSelected] = useState<Role>(resolved.editing);
  const roleKind = onProject ? "Project role" : "Organization role";

  return (
    <Dialog
      title={roleKind}
      description={groupRoleAnswer({
        level,
        groupName,
        members: memberCountLabel(memberCount),
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
          {onProject && resolved.role !== "NONE" && (
            <EffectiveRoleCard
              caption="combined permissions of inherited and project roles"
              roles={[resolved.role]}
            />
          )}
          {resolved.sources.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs">
                Roles {groupName} has on this project
              </p>
              <ul className="flex flex-col divide-y rounded-md border">
                {resolved.sources.map((source) => (
                  <li
                    key={source.key}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-3 px-3 py-2"
                  >
                    <span
                      className={`font-bold ${source.unused ? "text-muted-foreground" : ""}`}
                    >
                      <RoleWithIcon role={source.role} />
                    </span>
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-xs">
                        {source.tag}
                      </span>
                      {source.unused && (
                        <span className="text-muted-foreground text-xs">
                          {source.role === levelOrgRole
                            ? "same as inherited"
                            : `${roleName(levelOrgRole)} is higher, so this has no effect`}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
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
                  if (
                    onProject &&
                    role !== "NONE" &&
                    levelOrgRole !== "NONE" &&
                    includesRole(levelOrgRole, role, "project")
                  )
                    return `No effect: ${groupName} already gives ${roleName(levelOrgRole)} in the organization`;
                  return undefined;
                }}
              />
            )}
            {!onProject && (
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
