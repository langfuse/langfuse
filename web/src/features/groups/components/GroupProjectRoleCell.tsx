import { useId } from "react";
import { ChevronDown, Lock } from "@langfuse/icons";
import { type Role } from "@langfuse/shared";
import { systemRoleAccessRights } from "@langfuse/shared/rbac";

import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { RadioGroup } from "@/src/components/design-system/RadioGroup/RadioGroup";
import { roleIcons } from "@/src/features/rbac/components/roleIcons";
import { orderedRoles } from "@/src/features/rbac/constants/orderedRoles";

type GroupRole = "ADMIN" | "MEMBER" | "VIEWER";

const OPTIONS: Role[] = ["NONE", "VIEWER", "MEMBER", "ADMIN"];

const roleName = (role: Role) => systemRoleAccessRights[role].name;

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
 * What a group gives its members on this project. Groups only add access, so a
 * project role counts only when it is higher than the group's organization role.
 */
function resolveGroupProjectRole(orgRole: Role, projectRole: Role | null) {
  if (
    projectRole &&
    orgRole &&
    orgRole !== "NONE" &&
    orderedRoles[projectRole] <= orderedRoles[orgRole]
  ) {
    return { role: orgRole, tag: "Inherited from organization" };
  }
  if (projectRole) return { role: projectRole, tag: "Set on this project" };
  if (orgRole !== "NONE")
    return { role: orgRole, tag: "Inherited from organization" };
  return { role: "NONE" as Role, tag: "No role here" };
}

/**
 * The project groups table's role cell: the role the group gives on this
 * project, and a panel to set its project role.
 */
export function GroupProjectRoleCell({
  groupName,
  memberCount,
  orgRole: orgRoleOrNull,
  projectRole,
  grantableRoles,
  disabledReason,
  onChange,
}: {
  groupName: string;
  memberCount: number;
  orgRole: Role | null;
  projectRole: Role | null;
  /** Roles the current user may grant on this project. */
  grantableRoles: Role[];
  /** Why the project role cannot be changed here, if it cannot. */
  disabledReason?: string;
  onChange: (role: GroupRole | null) => void;
}) {
  const editorId = useId();
  const orgRole = orgRoleOrNull ?? "NONE";
  const effective = resolveGroupProjectRole(orgRole, projectRole);
  const projectApplies =
    projectRole !== null && effective.tag === "Set on this project";
  const members = `${memberCount} ${memberCount === 1 ? "member" : "members"}`;

  const optionReason = (role: Role) => {
    if (role === "NONE") return undefined;
    if (!grantableRoles.includes(role) && role !== projectRole)
      return "You cannot grant this role";
    return undefined;
  };
  /** Groups only add access: a project role at or below the organization role changes nothing. */
  const hasNoEffect = (role: Role) =>
    role !== "NONE" &&
    orgRole !== "NONE" &&
    orderedRoles[role] <= orderedRoles[orgRole];

  const tagChip = (
    <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px]">
      {effective.tag}
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
              <RoleWithIcon role={effective.role} />
            </span>
            {tagChip}
          </div>

          <ul className="flex flex-col divide-y border-y">
            <li className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-2 py-2">
              <span>Organization</span>
              <span
                className={
                  projectApplies || orgRole === "NONE"
                    ? "text-muted-foreground"
                    : "font-bold"
                }
              >
                <RoleWithIcon role={orgRole} />
              </span>
              <span className="text-muted-foreground text-right">
                {!projectApplies && orgRole !== "NONE" ? "Applies" : ""}
              </span>
            </li>
            <li className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-2 py-2">
              <span>This project</span>
              <span
                className={
                  projectApplies ? "font-bold" : "text-muted-foreground"
                }
              >
                {projectRole ? <RoleWithIcon role={projectRole} /> : "Not set"}
              </span>
              <span className="text-muted-foreground text-right">
                {projectApplies && "Applies"}
                {projectRole && !projectApplies && "No effect"}
              </span>
            </li>
          </ul>

          <div className="flex flex-col gap-2">
            <p id={editorId} className="font-bold">
              Project role for {groupName}
            </p>
            {disabledReason ? (
              <p className="text-muted-foreground">{disabledReason}</p>
            ) : (
              <div role="group" aria-labelledby={editorId}>
                <RadioGroup
                  value={projectRole ?? "NONE"}
                  onValueChange={(value) =>
                    onChange(value === "NONE" ? null : (value as GroupRole))
                  }
                >
                  {OPTIONS.map((role) => {
                    const reason = optionReason(role);
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
                            role === "NONE"
                              ? "Inherit from organization"
                              : undefined
                          }
                        />
                        {reason && (
                          <Lock size="sm" aria-label={`Locked: ${reason}`} />
                        )}
                        {!reason && hasNoEffect(role) && (
                          <span className="text-muted-foreground">
                            No effect
                          </span>
                        )}
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>
            )}
          </div>

          <p className="text-muted-foreground">
            {orgRole === "NONE"
              ? `Applies to ${members}. They keep their own roles.`
              : `${groupName} already gives ${roleName(orgRole)} in the organization, so only a higher project role changes anything. Applies to ${members}.`}
          </p>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <button
          type="button"
          className="hover:bg-muted inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border px-2 py-1 text-xs"
          aria-label={`${roleName(effective.role)}, ${effective.tag}. Change the project role of ${groupName}`}
          {...getTriggerProps()}
        >
          <span className="shrink-0 font-bold">
            <RoleWithIcon role={effective.role} />
          </span>
          <span className="min-w-0 truncate" title={effective.tag}>
            {tagChip}
          </span>
          <ChevronDown size="sm" aria-hidden="true" />
        </button>
      )}
    </HoverCard>
  );
}
