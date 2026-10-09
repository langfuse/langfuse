import {
  hasOrganizationKind,
  hasProjectKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  systemRoleAccessRights,
  type OwnerId,
  type PrincipalId,
  type ResourceId,
  type RoleId,
  type SystemRolePolicy,
  type TenantId,
} from "@langfuse/shared/rbac";
import { getRoleAssignmentsForPrincipal } from "@langfuse/shared/rbac/server";
import { type Prisma, type RoleAssignment } from "@langfuse/shared/src/db";
import { type Policy, type Role } from "./types";

/** getRolesForPrincipal loads a principal's roles with policies bound to each assignment. */
export async function getRolesForPrincipal(
  prisma: Prisma.TransactionClient,
  principalId: PrincipalId,
): Promise<Role[]> {
  const assignments = await getRoleAssignmentsForPrincipal(prisma, principalId);
  return assignments.map(toRole);
}

/** toRole binds a stored assignment's system role to its tenant and owner. */
function toRole(assignment: RoleAssignment): Role {
  const definition = systemRoleAccessRights[assignment.systemRole];
  const roleId = SystemRoleId(assignment.systemRole);
  const tenantId = OrganizationId(assignment.orgId);
  const ownerId = toOwnerId(assignment);
  const resources = hasProjectKind(ownerId)
    ? [ownerId]
    : [ownerId, ProjectId("*")];
  return {
    id: roleId,
    tenantId,
    name: definition.name,
    description: definition.description,
    policies: definition.policies
      .map((policy) => toPolicy(policy, roleId, tenantId, resources))
      .filter((policy): policy is Policy => policy !== null),
    tags: definition.tags,
  };
}

/** toOwnerId tags the populated owner foreign key. */
function toOwnerId(assignment: RoleAssignment): OwnerId {
  if (assignment.projectId !== null) return ProjectId(assignment.projectId);
  return OrganizationId(assignment.orgId);
}

/** toPolicy binds a catalog policy to resources of its kind. */
function toPolicy(
  definition: SystemRolePolicy,
  roleId: RoleId,
  tenantId: TenantId,
  resources: ResourceId[],
): Policy | null {
  const ofKind = resources.filter(
    definition.resourceKind === "organization"
      ? hasOrganizationKind
      : hasProjectKind,
  );
  if (ofKind.length === 0) return null;
  return {
    id: `${roleId}:${definition.resourceKind}`,
    roleId,
    tenantId,
    effect: definition.effect,
    actions: definition.actions,
    resources: ofKind,
  };
}
