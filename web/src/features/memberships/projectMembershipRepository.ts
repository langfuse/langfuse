/* eslint-disable @typescript-eslint/no-use-before-define */
import { LangfuseNotFoundError } from "@langfuse/shared";
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
  type Prisma,
  type ProjectMembership,
  type Role,
} from "@langfuse/shared/src/db";
import { withTransaction } from "@langfuse/shared/src/server";

/** saveProjectMembership upserts a user's project membership with a role and mirrors it into role assignments. */
export async function saveProjectMembership(
  prisma: Prisma.TransactionClient,
  { orgId, ...data }: ProjectMembershipInput,
): Promise<ProjectMembership> {
  return await withTransaction(prisma, async (tx) => {
    await assertProjectInOrg(tx, { orgId, projectId: data.projectId });
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
    await assertProjectInOrg(tx, { orgId, projectId: data.projectId });
    const membership = await tx.projectMembership.create({ data });
    await replaceProjectRole(tx, { ...membership, orgId });
    return membership;
  });
}

/** findOrCreateProjectMembership creates a missing project membership, keeping an existing one's role, and mirrors it into role assignments. */
export async function findOrCreateProjectMembership(
  prisma: Prisma.TransactionClient,
  { orgId, ...data }: ProjectMembershipInput,
): Promise<ProjectMembership> {
  return await withTransaction(prisma, async (tx) => {
    await assertProjectInOrg(tx, { orgId, projectId: data.projectId });
    const membership = await tx.projectMembership.upsert({
      where: {
        projectId_userId: { projectId: data.projectId, userId: data.userId },
      },
      update: {},
      create: data,
    });
    await replaceProjectRole(tx, { ...membership, orgId });
    return membership;
  });
}

/** deleteProjectMembership deletes a project membership and revokes its role assignment. */
export async function deleteProjectMembership(
  prisma: Prisma.TransactionClient,
  {
    orgId,
    projectId,
    userId,
  }: { orgId: string; projectId: string; userId: string },
): Promise<ProjectMembership> {
  return await withTransaction(prisma, async (tx) => {
    const membership = await tx.projectMembership.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    await revokeRolesForPrincipal(tx, {
      tenantId: OrganizationId(orgId),
      ownerId: ProjectId(projectId),
      principalId: UserId(userId),
    });
    return membership;
  });
}

/** ProjectNotInOrgError rejects a project membership whose project is outside the organization. */
export class ProjectNotInOrgError extends LangfuseNotFoundError {
  constructor() {
    super("Project not found in organization");
  }
}

/** assertProjectInOrg throws ProjectNotInOrgError unless the project belongs to the organization. */
async function assertProjectInOrg(
  tx: Prisma.TransactionClient,
  { orgId, projectId }: { orgId: string; projectId: string },
) {
  const project = await tx.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true },
  });
  if (!project) throw new ProjectNotInOrgError();
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
