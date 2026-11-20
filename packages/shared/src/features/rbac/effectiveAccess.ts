import { type Role } from "../../db";
import {
  organizationRoleAccessRights,
  type OrganizationScope,
} from "./organizationAccessRights";
import {
  projectRoleAccessRights,
  type ProjectScope,
} from "./projectAccessRights";

export type AccessLevel = "organization" | "project";

/** `projectId` null means org-wide. */
export type GroupRoleGrant = { projectId: string | null; role: Role };

const union = <T>(lists: readonly (readonly T[])[]): T[] => [
  ...new Set(lists.flat()),
];

export const roleScopes = (
  role: Role,
  level: AccessLevel,
): readonly (OrganizationScope | ProjectScope)[] =>
  level === "organization"
    ? organizationRoleAccessRights[role]
    : projectRoleAccessRights[role];

/** NONE never counts, though it keeps one organization scope. */
export const grantsAccess = (role: Role, level: AccessLevel): boolean =>
  role !== "NONE" && roleScopes(role, level).length > 0;

export function includesRole(
  role: Role,
  other: Role,
  level: AccessLevel,
): boolean {
  const scopes = new Set(roleScopes(role, level));
  return roleScopes(other, level).every((scope) => scopes.has(scope));
}

/** Drops roles whose permissions another held role already gives. */
export function resolveEffectiveRoles(
  held: Role[],
  level: AccessLevel,
): Role[] {
  const granting = [...new Set(held)].filter((role) =>
    grantsAccess(role, level),
  );
  return granting.filter(
    (role, index) =>
      !granting.some(
        (other, otherIndex) =>
          other !== role &&
          includesRole(other, role, level) &&
          (!includesRole(role, other, level) || otherIndex < index),
      ),
  );
}

export function groupRoleGrants<
  G extends {
    roleAssignments: { projectId?: string | null; systemRole: string }[];
  },
>(groups: G[]): (GroupRoleGrant & { group: G })[] {
  return groups.flatMap((group) =>
    group.roleAssignments.map((assignment) => ({
      group,
      projectId: assignment.projectId ?? null,
      role: assignment.systemRole as Role,
    })),
  );
}

export function resolveProjectRole({
  projectId,
  projectMemberships,
  orgMembershipRole,
}: {
  projectId: string;
  projectMemberships: { projectId: string; role: Role }[];
  orgMembershipRole: Role;
}): Role {
  return (
    projectMemberships.find((membership) => membership.projectId === projectId)
      ?.role ?? orgMembershipRole
  );
}

/** Undefined when no group grants anything org-wide. */
export function resolveOrganizationScopes({
  orgMembershipRole,
  groupRoles,
}: {
  orgMembershipRole: Role;
  groupRoles: GroupRoleGrant[];
}): OrganizationScope[] | undefined {
  const grants = groupRoles.filter((grant) => grant.projectId === null);
  if (grants.length === 0) return undefined;
  return union([
    organizationRoleAccessRights[orgMembershipRole],
    ...grants.map((grant) => organizationRoleAccessRights[grant.role]),
  ]);
}

/** Undefined when no group role applies to the project. */
export function resolveProjectScopes({
  projectId,
  projectMemberships,
  orgMembershipRole,
  groupRoles,
}: {
  projectId: string;
  projectMemberships: { projectId: string; role: Role }[];
  orgMembershipRole: Role;
  groupRoles: GroupRoleGrant[];
}): ProjectScope[] | undefined {
  const grants = groupRoles.filter(
    (grant) => grant.projectId === null || grant.projectId === projectId,
  );
  if (grants.length === 0) return undefined;
  const directRole = resolveProjectRole({
    projectId,
    projectMemberships,
    orgMembershipRole,
  });
  return union([
    projectRoleAccessRights[directRole],
    ...grants.map((grant) => projectRoleAccessRights[grant.role]),
  ]);
}
