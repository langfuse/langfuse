/* eslint-disable @typescript-eslint/no-use-before-define */
import { type Prisma, type ProjectMembership, type Role } from "@prisma/client";

import { LangfuseNotFoundError } from "../../errors";
import { withTransaction } from "../../server/utils/withTransaction";
import {
  replaceRolesForPrincipal,
  revokeRolesForPrincipal,
  revokeUserRoles,
} from "../rbac/roleAssignmentService";
import {
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  type RoleAssignment,
} from "../rbac/types";

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

/** deleteProjectMemberships deletes every membership on a project and revokes their role assignments. */
export async function deleteProjectMemberships(
  prisma: Prisma.TransactionClient,
  { projectId }: { projectId: string },
): Promise<void> {
  await withTransaction(prisma, async (tx) => {
    await tx.projectMembership.deleteMany({ where: { projectId } });
    await revokeUserRoles(tx, { ownerId: ProjectId(projectId) });
  });
}

/** getProjectMembershipRoles share-locks a user's project memberships and returns the role assignments they imply. */
export async function getProjectMembershipRoles(
  tx: Prisma.TransactionClient,
  { userId }: { userId: string },
): Promise<Omit<RoleAssignment, "id" | "createdAt" | "updatedAt">[]> {
  const memberships = await tx.$queryRaw<
    { orgId: string; projectId: string; role: Role }[]
  >`
    SELECT p.org_id AS "orgId", pm.project_id AS "projectId", pm.role
    FROM project_memberships pm
    JOIN projects p ON p.id = pm.project_id
    WHERE pm.user_id = ${userId}
    FOR SHARE OF pm
  `;
  return memberships.map((membership) =>
    projectMembershipRole({ ...membership, userId }),
  );
}

/** assertProjectInOrg throws LangfuseNotFoundError unless the project belongs to the organization. */
async function assertProjectInOrg(
  tx: Prisma.TransactionClient,
  { orgId, projectId }: { orgId: string; projectId: string },
) {
  const project = await tx.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true },
  });
  if (!project) {
    throw new LangfuseNotFoundError("Project not found in organization");
  }
}

/** replaceProjectRole mirrors a project membership's role into role assignments. */
async function replaceProjectRole(
  tx: Prisma.TransactionClient,
  membership: { orgId: string; projectId: string; userId: string; role: Role },
) {
  await replaceRolesForPrincipal(tx, projectMembershipRole(membership));
}

/** projectMembershipRole maps a project membership to the role assignment it implies. */
function projectMembershipRole({
  orgId,
  projectId,
  userId,
  role,
}: {
  orgId: string;
  projectId: string;
  userId: string;
  role: Role;
}): Omit<RoleAssignment, "id" | "createdAt" | "updatedAt"> {
  return {
    tenantId: OrganizationId(orgId),
    ownerId: ProjectId(projectId),
    principalId: UserId(userId),
    roleId: SystemRoleId(role),
    tags: [],
  };
}

type ProjectMembershipInput = {
  orgId: string;
  orgMembershipId: string;
  projectId: string;
  userId: string;
  role: Role;
};
