import { v4 } from "uuid";
import { describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  revokeApiKeyRolesForOwners,
  transferRoleAssignments,
} from "@langfuse/shared/rbac/server";
import { ProjectId, UserId } from "@langfuse/shared/rbac";

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
    await createAndAddApiKeysToDb({
      prisma,
      entityId: otherProject.id,
      scope: "PROJECT",
    });

    await revokeApiKeyRolesForOwners(prisma, [ProjectId(projectId)]);

    expect(await assignmentsFor(projectId, "apiKey/")).toHaveLength(0);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(1);
    expect(await assignmentsFor(otherProject.id, "apiKey/")).toHaveLength(1);
  });
});
