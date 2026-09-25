import {
  hasOrganizationKind,
  hasProjectKind,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type OwnerId,
  type PrincipalId,
  type ResourceId,
  type RoleId,
  type TenantId,
} from "@langfuse/shared/rbac";
import { type PrismaClient } from "@langfuse/shared/src/db";

import {
  getSystemRoles,
  type SystemRoleAssignmentWithRole,
} from "@/src/features/rbac/getSystemRoles";
import {
  type Policy,
  type Role,
  type SystemRolePolicy,
} from "@/src/features/rbac/types";

/** getRolesForPrincipal loads a principal's system-role assignments and expands them into bound roles; custom roles are a later ticket. */
export async function getRolesForPrincipal(
  principalId: PrincipalId,
  prisma?: PrismaClient,
): Promise<Role[]> {
  const assignments = await getSystemRoles(principalId, prisma);
  return toRoles(assignments);
}

/** toRoles turns each assignment into a role whose policies are bound to the owner's resources. */
function toRoles(ras: SystemRoleAssignmentWithRole[]): Role[] {
  const resourcesByRoleId = toResourcesByRoleId(ras);
  return ras.map((ra) => {
    const roleId = toRoleId(ra);
    const tenantId = OrganizationId(ra.orgId);
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
  ras: SystemRoleAssignmentWithRole[],
): Partial<Record<RoleId, ResourceId[]>> {
  const out: Partial<Record<RoleId, ResourceId[]>> = {};
  for (const ra of ras) {
    const roleId = toRoleId(ra);
    const resources = resourcesForOwner(ra.ownerId as OwnerId);
    out[roleId] = [...(out[roleId] ?? []), ...resources];
  }
  return out;
}

/** resourcesForOwner expands an owner into the resources its role binds to: a project owner is itself; an org owner is the org node plus the project-kind wildcard, which matches every project of the org. */
function resourcesForOwner(ownerId: OwnerId): ResourceId[] {
  if (hasProjectKind(ownerId)) return [ownerId];
  return [ownerId, ProjectId("*")];
}

/** toRoleId is the role id an assignment names; the system-only phase has no custom roles. */
function toRoleId(ra: SystemRoleAssignmentWithRole): RoleId {
  return SystemRoleId(ra.systemRole);
}

/** bindPolicy binds a catalog policy to the tagged resources of its own kind, dropping a policy whose kind has no matching resource so resolution stays total; a throw here would surface as a request-time 500. */
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
