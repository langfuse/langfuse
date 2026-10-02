import {
  hasOrganizationKind,
  hasProjectKind,
  ProjectId,
  type OwnerId,
  type PrincipalId,
  type ResourceId,
  type RoleId,
  type SystemRolePolicy,
  type TenantId,
} from "@langfuse/shared/rbac";
import {
  getRoleAssignmentsForPrincipal,
  type RoleAssignmentWithRole,
} from "@langfuse/shared/rbac/server";
import {
  prisma as defaultPrisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";

import { type Policy, type Role } from "@/src/features/rbac/types";

/** getRolesForPrincipal loads a principal's system-role assignments and expands them into roles whose policies are bound to concrete resources. */
export async function getRolesForPrincipal(
  principalId: PrincipalId,
  prisma: PrismaClient = defaultPrisma,
): Promise<Role[]> {
  const assignments = await getRoleAssignmentsForPrincipal(prisma, principalId);
  return toRoles(assignments);
}

/** toRoles turns each assignment into a role whose policies are bound to the owner's resources. */
function toRoles(ras: RoleAssignmentWithRole[]): Role[] {
  const resourcesByRoleId = toResourcesByRoleId(ras);
  return ras.map((ra) => {
    const roleId = ra.roleId;
    const tenantId = ra.tenantId;
    const resources = resourcesByRoleId[roleId] ?? [];
    const policies = ra.role.policies
      .map((policy) => bindPolicy(policy, roleId, tenantId, resources))
      .filter((policy): policy is Policy => policy !== null);
    return {
      id: roleId,
      tenantId,
      name: ra.role.name,
      description: ra.role.description,
      policies,
      tags: ra.role.tags,
    };
  });
}

/** toResourcesByRoleId groups every role's bound resources across a principal's assignments. */
function toResourcesByRoleId(
  ras: RoleAssignmentWithRole[],
): Partial<Record<RoleId, ResourceId[]>> {
  const out: Partial<Record<RoleId, ResourceId[]>> = {};
  for (const ra of ras) {
    const roleId = ra.roleId;
    const resources = resourcesForOwner(ra.ownerId);
    out[roleId] = [...(out[roleId] ?? []), ...resources];
  }
  return out;
}

/** resourcesForOwner expands an owner into the resources its role binds to: a project owner is itself; an org owner is the org node plus the project-kind wildcard, which matches every project of the org. */
function resourcesForOwner(ownerId: OwnerId): ResourceId[] {
  if (hasProjectKind(ownerId)) return [ownerId];
  return [ownerId, ProjectId("*")];
}

/** bindPolicy binds a catalog policy to the tagged resources of its own kind, returning null when the kind has no matching resource so the policy is dropped rather than bound to nothing. */
function bindPolicy(
  policy: SystemRolePolicy,
  roleId: RoleId,
  tenantId: TenantId,
  resources: ResourceId[],
): Policy | null {
  const ofKind = resources.filter(
    policy.resourceKind === "organization"
      ? hasOrganizationKind
      : hasProjectKind,
  );
  if (ofKind.length === 0) return null;
  return {
    id: `${roleId}:${policy.resourceKind}`,
    roleId,
    tenantId,
    effect: policy.effect,
    actions: policy.actions,
    resources: ofKind,
  };
}
