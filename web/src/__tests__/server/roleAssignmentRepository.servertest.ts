import { v4 } from "uuid";
import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  revokeApiKeyRolesForOwners,
  transferRoleAssignments,
} from "@langfuse/shared/rbac/server";
import { ProjectId, SystemRoleId, UserId } from "@langfuse/shared/rbac";

async function addUserAssignment(orgId: string, projectId: string) {
  await prisma.systemRoleAssignment.create({
    data: {
      orgId,
      principalId: UserId(v4()),
      ownerId: ProjectId(projectId),
      systemRole: "VIEWER",
    },
  });
}

async function assignmentsFor(projectId: string, prefix: string) {
  return prisma.systemRoleAssignment.findMany({
    where: {
      ownerId: ProjectId(projectId),
      principalId: { startsWith: prefix },
    },
  });
}

describe("transferRoleAssignments", () => {
  it("rolls back a root client's transfer when deleting user assignments fails", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    await addUserAssignment(orgId, projectId);
    const targetOrg = await prisma.organization.create({
      data: { id: v4(), name: v4() },
    });
    const failingPrisma = prisma.$extends({
      query: {
        systemRoleAssignment: {
          deleteMany({ args, query }) {
            if (args.where?.ownerId === ProjectId(projectId)) {
              throw new Error("assignment deletion failed");
            }
            return query(args);
          },
        },
      },
    });

    await expect(
      transferRoleAssignments(
        failingPrisma as typeof prisma,
        projectId,
        targetOrg.id,
      ),
    ).rejects.toThrow("assignment deletion failed");

    const apiKeyAssignments = await assignmentsFor(projectId, "apiKey/");
    expect(apiKeyAssignments[0].orgId).toBe(orgId);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(1);
  });

  it("joins the caller's transaction and rolls back with its project update", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    await addUserAssignment(orgId, projectId);
    const targetOrg = await prisma.organization.create({
      data: { id: v4(), name: v4() },
    });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: projectId },
          data: { orgId: targetOrg.id },
        });
        await transferRoleAssignments(tx, projectId, targetOrg.id);

        const assignments = await tx.systemRoleAssignment.findMany({
          where: { ownerId: ProjectId(projectId) },
        });
        expect(assignments).toHaveLength(1);
        expect(assignments[0].orgId).toBe(targetOrg.id);
        expect(assignments[0].principalId).toMatch(/^apiKey\//);
        throw new Error("outer transaction failed");
      }),
    ).rejects.toThrow("outer transaction failed");

    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.orgId).toBe(orgId);
    const apiKeyAssignments = await assignmentsFor(projectId, "apiKey/");
    expect(apiKeyAssignments[0].orgId).toBe(orgId);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(1);
  });

  it("moves api-key assignments to the destination org and drops user assignments", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    await addUserAssignment(orgId, projectId);
    const targetOrg = await prisma.organization.create({
      data: { id: v4(), name: v4() },
    });

    await transferRoleAssignments(prisma, projectId, targetOrg.id);

    const apiKeyAssignments = await assignmentsFor(projectId, "apiKey/");
    expect(apiKeyAssignments).toHaveLength(1);
    expect(apiKeyAssignments[0].orgId).toBe(targetOrg.id);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(0);
  });
});

describe("revokeApiKeyRolesForOwners", () => {
  it("revokes api-key assignments for the owners while leaving user and other-owner assignments", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    await addUserAssignment(orgId, projectId);

    const otherProject = await prisma.project.create({
      data: { id: v4(), name: v4(), orgId },
    });
    const keyCreator = await prisma.user.create({
      data: { email: `apikey-creator-${v4()}@example.com` },
    });
    await createApiKey(prisma, {
      owner: ProjectId(otherProject.id),
      role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
      createdBy: UserId(keyCreator.id),
    });

    await revokeApiKeyRolesForOwners(prisma, [ProjectId(projectId)]);

    expect(await assignmentsFor(projectId, "apiKey/")).toHaveLength(0);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(1);
    expect(await assignmentsFor(otherProject.id, "apiKey/")).toHaveLength(1);
  });
});
