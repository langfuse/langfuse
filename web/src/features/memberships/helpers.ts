import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import {
  replaceRoles,
  unassignRoles,
  unassignTenantRoles,
} from "@langfuse/shared/rbac/server";
import { type Prisma, type Role } from "@langfuse/shared/src/db";

/** assignOrgMembershipRole mirrors an organization membership's role into role assignments. */
export async function assignOrgMembershipRole(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<void> {
  await replaceRoles(prisma, {
    tenantId: OrganizationId(orgId),
    ownerId: OrganizationId(orgId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}

/** assignProjectMembershipRole mirrors a project membership's role into role assignments. */
export async function assignProjectMembershipRole(
  prisma: Prisma.TransactionClient,
  {
    orgId,
    projectId,
    userId,
    role,
  }: { orgId: string; projectId: string; userId: string; role: Role },
): Promise<void> {
  await replaceRoles(prisma, {
    tenantId: OrganizationId(orgId),
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}

/** unassignOrgMembershipRoles removes a departing member's organization and project role assignments. */
export async function unassignOrgMembershipRoles(
  prisma: Prisma.TransactionClient,
  { orgId, userId }: { orgId: string; userId: string },
): Promise<void> {
  await unassignTenantRoles(prisma, {
    tenantId: OrganizationId(orgId),
    principalId: UserId(userId),
  });
}

/** unassignProjectMembershipRole removes a project membership's role assignment. */
export async function unassignProjectMembershipRole(
  prisma: Prisma.TransactionClient,
  { projectId, userId }: { projectId: string; userId: string },
): Promise<void> {
  await unassignRoles(prisma, {
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
  });
}
