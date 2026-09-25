import {
  hasOrganizationKind,
  hasProjectKind,
  untag,
} from "@langfuse/shared/rbac";
import {
  prisma as defaultPrisma,
  type PrismaClient,
  type SystemRoleAssignment,
} from "@langfuse/shared/src/db";

import {
  type Policy,
  type SystemPolicy,
} from "@/src/features/auth/policy/types";
import { systemRoleAccessRights } from "@/src/features/rbac/constants/systemRoleAccessRights";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  type OwnerId,
  type PrincipalId,
  type Role,
  type RoleId,
  type TenantId,
} from "@/src/features/rbac/types";

/** getRolesForPrincipal loads a principal's system-role assignments and expands them into bound roles; custom roles are a later ticket. */
export async function getRolesForPrincipal(
  principalId: PrincipalId,
  prisma: PrismaClient = defaultPrisma,
): Promise<Role[]> {
  const assignments = await prisma.systemRoleAssignment.findMany({
    where: { principalId },
  });
  return toRoles(assignments, prisma);
}

/** toRoles turns each assignment into a role whose policies are bound to the owner's resources. */
async function toRoles(
  ras: SystemRoleAssignment[],
  prisma: PrismaClient,
): Promise<Role[]> {
  const resourcesByRoleId = await toResourcesByRoleId(ras, prisma);
  return ras.map((ra) => {
    const roleId = toRoleId(ra);
    const resources = resourcesByRoleId[roleId] ?? [];
    const policies = systemRoleAccessRights[ra.systemRole]
      .map((policy) => bindPolicy(policy, resources))
      .filter((policy): policy is Policy => policy !== null);
    return {
      id: roleId,
      tenantId: OrganizationId(ra.orgId) as TenantId,
      name: ra.systemRole,
      description: "",
      policies,
      tags: [],
    };
  });
}

/** toResourcesByRoleId groups every role's bound resources across a principal's assignments, tagged by kind for per-policy filtering. */
async function toResourcesByRoleId(
  ras: SystemRoleAssignment[],
  prisma: PrismaClient,
): Promise<Partial<Record<RoleId, OwnerId[]>>> {
  const out: Partial<Record<RoleId, OwnerId[]>> = {};
  for (const ra of ras) {
    const roleId = toRoleId(ra);
    const resources = await resourcesForOwner(ra.ownerId as OwnerId, prisma);
    out[roleId] = [...(out[roleId] ?? []), ...resources];
  }
  return out;
}

/** resourcesForOwner expands an owner into the resources its role binds to: a project owner is itself; an org owner is the org plus each of its live projects, reproducing today's org-key project cascade. */
async function resourcesForOwner(
  ownerId: OwnerId,
  prisma: PrismaClient,
): Promise<OwnerId[]> {
  if (hasProjectKind(ownerId)) return [ownerId];
  const projects = await prisma.project.findMany({
    where: { orgId: untag(ownerId), deletedAt: null },
    select: { id: true },
  });
  return [ownerId, ...projects.map((p) => ProjectId(p.id))];
}

/** toRoleId is the role id an assignment names; the system-only phase has no custom roles. */
function toRoleId(ra: SystemRoleAssignment): RoleId {
  return SystemRoleId(ra.systemRole);
}

/**
 * bindPolicy binds a resource-less policy to the resources of its own kind,
 * dropping tags to the flat ids the PDP compares against. A policy whose kind
 * has no matching resource is omitted so resolution stays total; a throw here
 * would surface as a request-time 500. This diverges from the prototype's
 * `assertPolicyHasResources`, which cannot fire for the api-key roles in play
 * (PROJECT/ORGANIZATION/SCORES_INGEST/INGEST/LLM_GATEWAY) but could for
 * users-phase roles.
 */
function bindPolicy(policy: SystemPolicy, resources: OwnerId[]): Policy | null {
  const ofKind = resources.filter(
    policy.kind === "organization" ? hasOrganizationKind : hasProjectKind,
  );
  if (ofKind.length === 0) return null;
  return { ...policy, resources: ofKind.map(untag) };
}
