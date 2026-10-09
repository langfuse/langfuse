import { v4 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import { InternalServerError, InvalidRequestError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import {
  assignRole,
  backfillApiKeyRoleAssignment,
  getRoleAssignmentsForPrincipal,
  transferRoleAssignments,
} from "@langfuse/shared/rbac/server";
import {
  ApiKeyId,
  OrganizationId,
  ProjectId,
  SystemRoleId,
  UserId,
  type RoleId,
} from "@langfuse/shared/rbac";

describe("role assignment integrity", () => {
  it("rechecks existing grants before backfilling a key", async () => {
    const fixture = await createOrgProjectAndApiKey();
    const key = await prisma.apiKey.findUniqueOrThrow({
      where: { publicKey: fixture.publicKey },
    });
    await prisma.roleAssignment.updateMany({
      where: { apiKeyId: key.id },
      data: { roleId: "system/INGEST", systemRole: "INGEST" },
    });
    const before = await prisma.roleAssignment.findMany({
      where: { apiKeyId: key.id },
    });
    await backfillApiKeyRoleAssignment(
      prisma,
      key.id,
      OrganizationId(fixture.orgId),
    );
    expect(
      await prisma.roleAssignment.findMany({ where: { apiKeyId: key.id } }),
    ).toEqual(before);
  });

  it.each(["system/UNKNOWN", "system/", "system/toString"])(
    "rejects invalid role %s before opening a transaction",
    async (roleId) => {
      const transaction = vi.fn();
      const client = { $transaction: transaction } as unknown as typeof prisma;
      await expect(
        assignRole(client, {
          tenantId: OrganizationId("org"),
          ownerId: OrganizationId("org"),
          principalId: UserId("user"),
          roleId: roleId as RoleId,
          tags: [],
        }),
      ).rejects.toBeInstanceOf(InvalidRequestError);
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["organization", "project"])(
    "rejects a %s owner outside the assignment tenant",
    async (kind) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const tenant = await prisma.organization.create({ data: { name: v4() } });
      const user = await prisma.user.create({ data: { name: v4() } });

      await expect(
        assignRole(prisma, {
          tenantId: OrganizationId(tenant.id),
          ownerId:
            kind === "project" ? ProjectId(projectId) : OrganizationId(orgId),
          principalId: UserId(user.id),
          roleId: SystemRoleId("VIEWER"),
          tags: [],
        }),
      ).rejects.toBeInstanceOf(InvalidRequestError);
      expect(
        await prisma.roleAssignment.count({ where: { userId: user.id } }),
      ).toBe(0);
    },
  );

  it("holds project tenancy stable until assignment commit during a transfer", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const target = await prisma.organization.create({ data: { name: v4() } });
    const user = await prisma.user.create({ data: { name: v4() } });
    let releaseAssignment!: () => void;
    const commitAllowed = new Promise<void>((resolve) => {
      releaseAssignment = resolve;
    });
    let signalAssigned!: () => void;
    const assigned = new Promise<void>((resolve) => {
      signalAssigned = resolve;
    });
    let transferPid: number | undefined;
    let assignmentPid: number | undefined;
    const assignment = prisma.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        assignmentPid = backend.pid;
        await assignRole(tx, {
          tenantId: OrganizationId(orgId),
          ownerId: ProjectId(projectId),
          principalId: UserId(user.id),
          roleId: SystemRoleId("VIEWER"),
          tags: [],
        });
        signalAssigned();
        await commitAllowed;
      },
      { timeout: 15000 },
    );
    await Promise.race([assigned, assignment]);
    const transfer = prisma.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<
          { pid: number }[]
        >`SELECT pg_backend_pid() AS pid`;
        transferPid = backend.pid;
        await tx.project.update({
          where: { id: projectId },
          data: { orgId: target.id },
        });
        await transferRoleAssignments(tx, projectId, target.id);
      },
      { timeout: 15000 },
    );
    try {
      await vi.waitFor(
        async () => {
          expect(transferPid).toBeDefined();
          const [locks] = await prisma.$queryRaw<{ blockers: number[] }[]>`
          SELECT pg_blocking_pids(${transferPid}::int) AS blockers
        `;
          expect(locks.blockers).toContain(assignmentPid);
        },
        { timeout: 2000, interval: 25 },
      );
    } finally {
      releaseAssignment();
      await Promise.all([assignment, transfer]);
    }
    expect(
      await prisma.roleAssignment.count({ where: { userId: user.id } }),
    ).toBe(0);
  });

  it("rejects assignments for a user that does not exist", async () => {
    const project = await prisma.project.create({
      data: {
        name: v4(),
        organization: { create: { name: v4() } },
      },
    });

    await expect(
      assignRole(prisma, {
        tenantId: OrganizationId(project.orgId),
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
      userId: user.id,
      principalId: UserId(user.id),
      projectId,
      ownerId: ProjectId(projectId),
      systemRole: "VIEWER",
      roleId: SystemRoleId("VIEWER"),
    },
  });
  return { ...assignment, userId: user.id };
}

async function assignmentsFor(projectId: string, prefix: string) {
  return prisma.roleAssignment.findMany({
    where: {
      projectId: projectId,
      ...(prefix === "apiKey/"
        ? { apiKeyId: { not: null } }
        : { userId: { not: null } }),
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
            if (args.where?.projectId === projectId) {
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
          where: { projectId: projectId },
        });
        expect(assignments).toHaveLength(1);
        expect(assignments[0].orgId).toBe(targetOrg.id);
        expect(assignments[0].apiKeyId).not.toBeNull();
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

describe("role assignment rolling compatibility", () => {
  it.each([
    ["user", "organization"],
    ["user", "project"],
    ["api key", "organization"],
    ["api key", "project"],
  ] as const)(
    "supports old and new writers for a %s on a %s",
    async (principal, owner) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const key = await prisma.apiKey.findFirstOrThrow({
        where: { projectId },
      });
      const user = await prisma.user.create({ data: { name: v4() } });
      const id = v4();
      const userId = principal === "user" ? user.id : null;
      const apiKeyId = principal === "api key" ? key.id : null;
      const ownerProjectId = owner === "project" ? projectId : null;
      const ownerOrgId = owner === "organization" ? orgId : null;
      const principalId = userId ? UserId(userId) : ApiKeyId(key.id);
      const ownerId = ownerProjectId
        ? ProjectId(ownerProjectId)
        : OrganizationId(orgId);

      await prisma.$executeRaw`
      INSERT INTO role_assignments
        (id, org_id, principal_user_id, principal_api_key_id, owner_project_id, owner_org_id, system_role)
      VALUES (${id}, ${orgId}, ${userId}, ${apiKeyId}, ${ownerProjectId}, ${ownerOrgId}, 'VIEWER')
    `;
      expect(
        await prisma.roleAssignment.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({
        principalId,
        ownerId,
        roleId: SystemRoleId("VIEWER"),
        userId,
        apiKeyId,
        projectId: ownerProjectId,
        orgId,
      });

      await assignRole(prisma, {
        tenantId: OrganizationId(orgId),
        principalId,
        ownerId,
        roleId: SystemRoleId("ADMIN"),
        tags: [],
      });
      const legacyRows = await prisma.$queryRaw`
      SELECT principal_user_id, principal_api_key_id, owner_project_id, owner_org_id,
        user_id, api_key_id, project_id
      FROM role_assignments
      WHERE principal_id = ${principalId} AND owner_id = ${ownerId} AND system_role = 'ADMIN'
    `;
      expect(legacyRows).toEqual([
        {
          principal_user_id: userId,
          principal_api_key_id: apiKeyId,
          owner_project_id: ownerProjectId,
          owner_org_id: ownerOrgId,
          user_id: userId,
          api_key_id: apiKeyId,
          project_id: ownerProjectId,
        },
      ]);

      const nextPrincipalId = userId ? ApiKeyId(key.id) : UserId(user.id);
      const nextProjectId = ownerProjectId ? null : projectId;
      const nextOwnerId = nextProjectId
        ? ProjectId(nextProjectId)
        : OrganizationId(orgId);
      const updated = await prisma.roleAssignment.update({
        where: {
          roleId_principalId_ownerId: {
            roleId: SystemRoleId("ADMIN"),
            principalId,
            ownerId,
          },
        },
        data: {
          principalId: nextPrincipalId,
          userId: userId ? null : user.id,
          apiKeyId: userId ? key.id : null,
          projectId: nextProjectId,
          ownerId: nextOwnerId,
        },
      });
      const updatedLegacyRows = await prisma.$queryRaw`
        SELECT principal_user_id, principal_api_key_id, owner_project_id, owner_org_id,
          user_id, api_key_id, project_id
        FROM role_assignments WHERE id = ${updated.id}
      `;
      expect(updatedLegacyRows).toEqual([
        {
          principal_user_id: userId ? null : user.id,
          principal_api_key_id: userId ? key.id : null,
          owner_project_id: nextProjectId,
          owner_org_id: nextProjectId ? null : orgId,
          user_id: userId ? null : user.id,
          api_key_id: userId ? key.id : null,
          project_id: nextProjectId,
        },
      ]);
    },
  );
});

describe("role assignment foreign keys", () => {
  it.each([
    ["user", "organization"],
    ["user", "project"],
    ["api key", "organization"],
    ["api key", "project"],
  ] as const)(
    "rejects duplicate %s assignments on an %s owner while allowing distinct roles",
    async (principal, owner) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const key = await prisma.apiKey.findFirstOrThrow({
        where: { projectId },
      });
      const user = await prisma.user.create({
        data: { email: `${v4()}@example.com` },
      });
      const assignment = {
        tenantId: OrganizationId(orgId),
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
      await assignRole(prisma, {
        ...assignment,
        roleId: SystemRoleId("ADMIN"),
      });
      const stored = await prisma.roleAssignment.findUniqueOrThrow({
        where: {
          roleId_principalId_ownerId: {
            roleId: assignment.roleId,
            principalId: assignment.principalId,
            ownerId: assignment.ownerId,
          },
        },
        include: {
          user: true,
          apiKey: true,
          project: true,
          organization: true,
        },
      });
      expect(stored).toMatchObject({
        principalId: assignment.principalId,
        ownerId: assignment.ownerId,
        roleId: assignment.roleId,
        user: principal === "user" ? { id: user.id } : null,
        apiKey: principal === "api key" ? { id: key.id } : null,
        project: owner === "project" ? { id: projectId } : null,
        organization: { id: orgId },
      });
    },
  );

  it.each(["userId", "apiKeyId", "orgId", "projectId"] as const)(
    "rejects a missing %s",
    async (field) => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();
      const user = await prisma.user.create({
        data: { email: `${v4()}@example.com` },
      });
      const missingId = v4();
      const userId = field === "userId" ? missingId : user.id;
      const ownerProjectId = field === "projectId" ? missingId : projectId;
      const data = {
        orgId: field === "orgId" ? missingId : orgId,
        userId: field === "apiKeyId" ? null : userId,
        apiKeyId: field === "apiKeyId" ? missingId : null,
        principalId:
          field === "apiKeyId" ? ApiKeyId(missingId) : UserId(userId),
        projectId: field === "orgId" ? null : ownerProjectId,
        ownerId:
          field === "orgId"
            ? OrganizationId(missingId)
            : ProjectId(ownerProjectId),
        roleId: SystemRoleId("VIEWER"),
        systemRole: "VIEWER" as const,
      };

      await expect(
        prisma.roleAssignment.create({ data }),
      ).rejects.toMatchObject({
        code: "P2003",
      });
    },
  );

  it.each([
    "both principals",
    "neither principal",
    "mismatched user",
    "mismatched api key",
    "unknown principal kind",
    "mismatched project",
    "mismatched organization",
    "organization owner with project",
    "project owner without project",
    "unknown owner kind",
    "mismatched system role",
    "custom role",
  ] as const)("rejects creates and updates with %s", async (invalidShape) => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const key = await prisma.apiKey.findFirstOrThrow({ where: { projectId } });
    const user = await prisma.user.create({
      data: { email: `${v4()}@example.com` },
    });
    const validData = {
      orgId,
      userId: user.id,
      apiKeyId: null,
      principalId: UserId(user.id),
      projectId,
      ownerId: ProjectId(projectId),
      systemRole: "VIEWER" as const,
      roleId: SystemRoleId("VIEWER"),
    };
    const invalidFields = {
      "both principals": { apiKeyId: key.id },
      "neither principal": { userId: null },
      "mismatched user": { principalId: UserId(v4()) },
      "mismatched api key": {
        userId: null,
        apiKeyId: key.id,
        principalId: ApiKeyId(v4()),
      },
      "unknown principal kind": { principalId: `service/${user.id}` },
      "mismatched project": { ownerId: ProjectId(v4()) },
      "mismatched organization": {
        projectId: null,
        ownerId: OrganizationId(v4()),
      },
      "organization owner with project": { ownerId: OrganizationId(orgId) },
      "project owner without project": { projectId: null },
      "unknown owner kind": { ownerId: `workspace/${orgId}` },
      "mismatched system role": { roleId: SystemRoleId("ADMIN") },
      "custom role": { roleId: `custom/${v4()}` },
    }[invalidShape];

    await expect(
      prisma.roleAssignment.create({
        data: { ...validData, ...invalidFields },
      }),
    ).rejects.toThrow(/check constraint/);
    const assignment = await prisma.roleAssignment.create({ data: validData });
    await expect(
      prisma.roleAssignment.update({
        where: { id: assignment.id },
        data: invalidFields,
      }),
    ).rejects.toThrow(/check constraint/);
    expect(
      await prisma.roleAssignment.findUnique({ where: { id: assignment.id } }),
    ).toEqual(assignment);
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
        tenantId: OrganizationId(orgId),
        ownerId: OrganizationId(orgId),
        principalId: UserId(userAssignment.userId),
        roleId: SystemRoleId("VIEWER"),
        tags: [],
      });

      const affectedAssignments = await prisma.roleAssignment.findMany({
        where: {
          user: { userId: userAssignment.userId },
          "api key": { apiKeyId: key.id },
          project: { projectId: projectId },
          organization: { orgId },
        }[deletedEntity],
      });
      expect(affectedAssignments.length).toBeGreaterThan(0);

      if (deletedEntity === "user")
        await prisma.user.delete({
          where: { id: userAssignment.userId },
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

  it("loads stored assignments with the caller-supplied tenant for both principal kinds", async () => {
    const { projectId, orgId } = await createOrgProjectAndApiKey();
    const key = await prisma.apiKey.findFirstOrThrow({ where: { projectId } });
    const assignment = await addUserAssignment(orgId, projectId);
    const principalId = UserId(assignment.userId);
    await assignRole(prisma, {
      tenantId: OrganizationId(orgId),
      ownerId: OrganizationId(orgId),
      principalId,
      roleId: SystemRoleId("ADMIN"),
      tags: [],
    });

    expect(await getRoleAssignmentsForPrincipal(prisma, principalId)).toEqual(
      expect.arrayContaining([
        assignment,
        {
          id: expect.any(String),
          orgId,
          userId: assignment.userId,
          apiKeyId: null,
          principalId,
          ownerId: OrganizationId(orgId),
          projectId: null,
          systemRole: "ADMIN",
          roleId: SystemRoleId("ADMIN"),
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      ]),
    );
    expect(
      await getRoleAssignmentsForPrincipal(prisma, ApiKeyId(key.id)),
    ).toEqual([
      {
        id: expect.any(String),
        orgId,
        apiKeyId: key.id,
        userId: null,
        principalId: ApiKeyId(key.id),
        projectId: projectId,
        ownerId: ProjectId(projectId),
        systemRole: "LEGACY_PROJECT_API_KEY",
        roleId: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      },
    ]);
  });
});
