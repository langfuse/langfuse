/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";
import {
  replaceRolesForPrincipal,
  revokeRolesForPrincipal,
} from "@langfuse/shared/rbac/server";
import {
  type OrganizationMembership,
  type Prisma,
  type ProjectMembership,
  type Role,
} from "@langfuse/shared/src/db";
import { withTransaction } from "@langfuse/shared/src/server";

/** assignOrgMembershipRole upserts a user's organization membership with a role and mirrors it into role assignments. */
export async function assignOrgMembershipRole(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.upsert({
      where: { orgId_userId: { orgId, userId } },
      update: { role },
      create: { orgId, userId, role },
    });
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** createOrgMembership creates an organization membership, failing on duplicates, and mirrors it into role assignments. */
export async function createOrgMembership(
  prisma: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
): Promise<OrganizationMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.organizationMembership.create({
      data: { orgId, userId, role },
    });
    await replaceOrgRole(tx, membership);
    return membership;
  });
}

/** assignProjectMembershipRole upserts a user's project membership with a role and mirrors it into role assignments. */
export async function assignProjectMembershipRole(
  prisma: Prisma.TransactionClient,
  { orgId, ...data }: ProjectMembershipInput,
): Promise<ProjectMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.projectMembership.upsert({
      where: {
        projectId_userId: { projectId: data.projectId, userId: data.userId },
      },
      update: { role: data.role },
      create: data,
    });
    await replaceProjectRole(tx, { ...membership, orgId });
    return membership;
  });
}

/** createProjectMembership creates a project membership, failing on duplicates, and mirrors it into role assignments. */
export async function createProjectMembership(
  prisma: Prisma.TransactionClient,
  { orgId, ...data }: ProjectMembershipInput,
): Promise<ProjectMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.projectMembership.create({ data });
    await replaceProjectRole(tx, { ...membership, orgId });
    return membership;
  });
}

/** unassignOrgMembershipRoles removes a departing member's organization and project role assignments. */
export async function unassignOrgMembershipRoles(
  prisma: Prisma.TransactionClient,
  { orgId, userId }: { orgId: string; userId: string },
): Promise<void> {
  await revokeRolesForPrincipal(prisma, {
    tenantId: OrganizationId(orgId),
    principalId: UserId(userId),
  });
}

/** unassignProjectMembershipRole removes a project membership's role assignment. */
export async function unassignProjectMembershipRole(
  prisma: Prisma.TransactionClient,
  {
    orgId,
    projectId,
    userId,
  }: { orgId: string; projectId: string; userId: string },
): Promise<void> {
  await revokeRolesForPrincipal(prisma, {
    tenantId: OrganizationId(orgId),
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
  });
}

/** replaceOrgRole mirrors an organization membership's role into role assignments. */
async function replaceOrgRole(
  tx: Prisma.TransactionClient,
  { orgId, userId, role }: { orgId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, {
    tenantId: OrganizationId(orgId),
    ownerId: OrganizationId(orgId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}

/** replaceProjectRole mirrors a project membership's role into role assignments. */
async function replaceProjectRole(
  tx: Prisma.TransactionClient,
  {
    orgId,
    projectId,
    userId,
    role,
  }: { orgId: string; projectId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, {
    tenantId: OrganizationId(orgId),
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  });
}

type ProjectMembershipInput = {
  orgId: string;
  orgMembershipId: string;
  projectId: string;
  userId: string;
  role: Role;
};
