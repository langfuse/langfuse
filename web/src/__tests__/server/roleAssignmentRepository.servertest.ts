import { v4 } from "uuid";
import { describe, expect, it } from "vitest";

import { InternalServerError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  assignRole,
  getRoleAssignmentsForPrincipal,
  transferRoleAssignments,
} from "@langfuse/shared/rbac/server";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";

describe("role assignment integrity", () => {
  it("rejects assignments for a user that does not exist", async () => {
    const project = await prisma.project.create({
      data: {
        name: v4(),
        organization: { create: { name: v4() } },
      },
    });

    await expect(
      assignRole(prisma, {
        principalId: UserId(v4()),
        ownerId: ProjectId(project.id),
        roleId: SystemRoleId("VIEWER"),
        tags: [],
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

async function addUserAssignment(orgId: string, projectId: string) {
  const user = await prisma.user.create({
    data: { email: `${v4()}@example.com` },
  });
  const assignment = await prisma.roleAssignment.create({
    data: {
      orgId,
      principalUserId: user.id,
      ownerProjectId: projectId,
      systemRole: "VIEWER",
    },
  });
  return { ...assignment, principalUserId: user.id };
}

async function assignmentsFor(projectId: string, prefix: string) {
  return prisma.roleAssignment.findMany({
    where: {
      ownerProjectId: projectId,
      ...(prefix === "apiKey/"
        ? { principalApiKeyId: { not: null } }
        : { principalUserId: { not: null } }),
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
        roleAssignment: {
          deleteMany({ args, query }) {
            if (args.where?.ownerProjectId === projectId) {
              throw new InternalServerError("assignment deletion failed");
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

        const assignments = await tx.roleAssignment.findMany({
          where: { ownerProjectId: projectId },
        });
        expect(assignments).toHaveLength(1);
        expect(assignments[0].orgId).toBe(targetOrg.id);
        expect(assignments[0].principalApiKeyId).not.toBeNull();
        throw new InternalServerError("outer transaction failed");
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

describe("API-key deletion", () => {
  it("cascades bulk key deletion while preserving user and other-project assignments", async () => {
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

    await prisma.apiKey.deleteMany({
      where: { projectId, scope: "PROJECT" },
    });

    expect(await assignmentsFor(projectId, "apiKey/")).toHaveLength(0);
    expect(await assignmentsFor(projectId, "user/")).toHaveLength(1);
    expect(await assignmentsFor(otherProject.id, "apiKey/")).toHaveLength(1);
  });
});

describe("role assignment foreign keys", () => {
  it.each([
    ["user", "organization"],
    ["user", "project"],
    ["api key", "organization"],
    ["api key", "project"],
  ] as const)(
    "rejects duplicate %s assignments on an %s owner",
    async (principal, owner) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const key = await prisma.apiKey.findFirstOrThrow({
        where: { projectId },
      });
      const user = await prisma.user.create({
        data: { email: `${v4()}@example.com` },
      });
      const assignment = {
        principalId: principal === "user" ? UserId(user.id) : ApiKeyId(key.id),
        ownerId:
          owner === "organization"
            ? OrganizationId(orgId)
            : ProjectId(projectId),
        roleId: SystemRoleId("VIEWER"),
        tags: [],
      };
      await assignRole(prisma, assignment);

      await expect(assignRole(prisma, assignment)).rejects.toMatchObject({
        code: "P2002",
      });
    },
  );

  it.each([
    "principalUserId",
    "principalApiKeyId",
    "ownerOrgId",
    "ownerProjectId",
  ] as const)("rejects a missing %s", async (field) => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const user = await prisma.user.create({
      data: { email: `${v4()}@example.com` },
    });
    const data = {
      orgId,
      principalUserId: field === "principalApiKeyId" ? null : user.id,
      ownerProjectId: field === "ownerOrgId" ? null : projectId,
      systemRole: "VIEWER" as const,
      [field]: v4(),
    };

    await expect(prisma.roleAssignment.create({ data })).rejects.toMatchObject({
      code: "P2003",
    });
  });

  it.each([
    "both principals",
    "neither principal",
    "both owners",
    "neither owner",
  ] as const)("rejects assignments with %s", async (invalidShape) => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const key = await prisma.apiKey.findFirstOrThrow({ where: { projectId } });
    const user = await prisma.user.create({
      data: { email: `${v4()}@example.com` },
    });
    const data = {
      orgId,
      principalUserId: invalidShape === "neither principal" ? null : user.id,
      principalApiKeyId: invalidShape === "both principals" ? key.id : null,
      ownerProjectId: invalidShape === "neither owner" ? null : projectId,
      ownerOrgId: invalidShape === "both owners" ? orgId : null,
      systemRole: "VIEWER" as const,
    };

    await expect(prisma.roleAssignment.create({ data })).rejects.toThrow(
      /check constraint/,
    );
  });

  it.each(["user", "api key", "project", "organization"] as const)(
    "cascades assignments when deleting their %s",
    async (deletedEntity) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const key = await prisma.apiKey.findFirstOrThrow({
        where: { projectId },
      });
      const userAssignment = await addUserAssignment(orgId, projectId);
      await assignRole(prisma, {
        ownerId: OrganizationId(orgId),
        principalId: UserId(userAssignment.principalUserId),
        roleId: SystemRoleId("VIEWER"),
        tags: [],
      });

      const affectedAssignments = await prisma.roleAssignment.findMany({
        where: {
          user: { principalUserId: userAssignment.principalUserId },
          "api key": { principalApiKeyId: key.id },
          project: { ownerProjectId: projectId },
          organization: { orgId },
        }[deletedEntity],
      });
      expect(affectedAssignments.length).toBeGreaterThan(0);

      if (deletedEntity === "user")
        await prisma.user.delete({
          where: { id: userAssignment.principalUserId },
        });
      if (deletedEntity === "api key")
        await prisma.apiKey.delete({ where: { id: key.id } });
      if (deletedEntity === "project")
        await prisma.project.delete({ where: { id: projectId } });
      if (deletedEntity === "organization")
        await prisma.organization.delete({ where: { id: orgId } });

      expect(
        await prisma.roleAssignment.count({
          where: { id: { in: affectedAssignments.map(({ id }) => id) } },
        }),
      ).toBe(0);
    },
  );

  it("loads tagged principal, owner, role, and tenant identifiers for both principal kinds", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const key = await prisma.apiKey.findFirstOrThrow({ where: { projectId } });
    const assignment = await addUserAssignment(orgId, projectId);
    const principalId = UserId(assignment.principalUserId);
    await assignRole(prisma, {
      ownerId: OrganizationId(orgId),
      principalId,
      roleId: SystemRoleId("ADMIN"),
      tags: [],
    });

    expect(await getRoleAssignmentsForPrincipal(prisma, principalId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          principalId,
          tenantId: OrganizationId(orgId),
          ownerId: ProjectId(projectId),
          roleId: SystemRoleId("VIEWER"),
          role: expect.objectContaining({ name: "Viewer" }),
        }),
        expect.objectContaining({
          principalId,
          tenantId: OrganizationId(orgId),
          ownerId: OrganizationId(orgId),
          roleId: SystemRoleId("ADMIN"),
        }),
      ]),
    );
    expect(
      await getRoleAssignmentsForPrincipal(prisma, ApiKeyId(key.id)),
    ).toEqual([
      expect.objectContaining({
        principalId: ApiKeyId(key.id),
        tenantId: OrganizationId(orgId),
        ownerId: ProjectId(projectId),
        roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
      }),
    ]);
  });
});
