import { type Role } from "@langfuse/shared";
import { grantsAccess, includesRole } from "@langfuse/shared/rbac";

import { roleName } from "@/src/features/rbac/components/roleDisplay";
import { byPermissionCount } from "@/src/features/rbac/utils/byPermissionCount";

const GROUP_ROLES = ["ADMIN", "MEMBER", "VIEWER", "AI_GATEWAY"] as const;

export type GroupRole = (typeof GROUP_ROLES)[number];

export type GroupLevel = "organization" | "project";

export const isGroupRole = (role: Role): role is GroupRole =>
  (GROUP_ROLES as readonly Role[]).includes(role);

/** AI Gateway is an organization-only role. */
export const groupRoleOptions = (
  level: GroupLevel,
  isAiGatewayEnabled: boolean,
): Role[] =>
  (
    ["NONE", ...GROUP_ROLES].filter(
      (role) =>
        role !== "AI_GATEWAY" ||
        (level === "organization" && isAiGatewayEnabled),
    ) as Role[]
  ).toSorted(byPermissionCount);

export const noOrgRoleDescription = "The group gives no organization role.";

export const onProjectLevel = (role: Role): Role =>
  grantsAccess(role, "project") ? role : "NONE";

export function inheritedRoleDescription(levelOrgRole: Role): string {
  if (levelOrgRole === "NONE")
    return "No access to this project through this group.";
  return `Keep the group's organization role (${roleName(levelOrgRole)}) on this project.`;
}

export function orgRoleNote(role: Role): string | undefined {
  if (role === "NONE") return undefined;
  if (role === "AI_GATEWAY")
    return "Adds AI Gateway access on top of each member's existing role.";
  return "Applies to all projects in this organization. Members keep their own role when it is higher.";
}

function orgRoleTag(orgRole: Role): string {
  if (orgRole === "NONE") return "No organization role";
  if (orgRole === "AI_GATEWAY") return "Organization only";
  return "Applies in every project";
}

/** Groups only add access, so on a project a role counts only when it is higher than the group's org role. */
export function resolveGroupRole(
  level: GroupLevel,
  orgRole: Role,
  projectRole: Role | null,
): { role: Role; tag: string; editing: Role } {
  if (level === "organization")
    return { role: orgRole, tag: orgRoleTag(orgRole), editing: orgRole };
  const inherited = onProjectLevel(orgRole);
  const projectApplies =
    projectRole !== null && !includesRole(inherited, projectRole, "project");
  let tag = "No role here";
  if (projectRole !== null) tag = "Set on this project";
  else if (inherited !== "NONE") tag = "Inherited from organization";
  return {
    role: projectApplies && projectRole ? projectRole : inherited,
    tag,
    editing: projectRole ?? "NONE",
  };
}

export function describeGroupRoleCell(props: {
  level: GroupLevel;
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
