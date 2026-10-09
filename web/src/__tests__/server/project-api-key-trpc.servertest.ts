import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { ProjectId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { env } from "@/src/env.mjs";
import { randomUUID } from "crypto";

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { ...actual, env: { ...actual.env } };
});

const originalRoleConfig = {
  API_AUTH_MIGRATION: env.API_AUTH_MIGRATION,
  API_KEY_PROJECT_ROLES_ENABLE: env.API_KEY_PROJECT_ROLES_ENABLE,
  API_KEY_ORG_ROLES_ENABLE: env.API_KEY_ORG_ROLES_ENABLE,
};

beforeEach(() => {
  Object.assign(env, {
    API_AUTH_MIGRATION: "enforce",
    API_KEY_PROJECT_ROLES_ENABLE: "false",
    API_KEY_ORG_ROLES_ENABLE: "false",
  });
});

afterEach(() => {
  Object.assign(env, originalRoleConfig);
});

describe("project API keys trpc", () => {
  // The session user is persisted as the API key creator, so it must exist
  // in the database (CI does not run the seeder that creates user-1).
  // createMany + skipDuplicates is atomic, so concurrently running test
  // files can ensure the user without racing each other.
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: "user-1",
          name: "Demo User",
          email: "demo-user-1@langfuse.com",
        },
      ],
      skipDuplicates: true,
    });
  });

  async function createProjectCaller(
    projectRole: "ADMIN" | "MEMBER" = "ADMIN",
  ) {
    const { projectId, orgId, publicKey } = await createOrgProjectAndApiKey();

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        canCreateOrganizations: true,
        name: "Demo User",
        organizations: [
          {
            id: orgId,
            name: "Test Organization",
            role: "OWNER",
            plan: "cloud:hobby",
            cloudConfig: undefined,
            metadata: {},
            aiFeaturesEnabled: false,
            aiTelemetryEnabled: true,
            projects: [
              {
                id: projectId,
                role: projectRole,
                retentionDays: 30,
                deletedAt: null,
                hasTraces: false,
                name: "Test Project",
                metadata: {},
                createdAt: new Date().toISOString(),
              },
            ],
          },
        ],
        featureFlags: testFeatureFlags(),
        admin: false,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    return { caller, projectId, publicKey };
  }

  describe("projectApiKeys.byProjectId", () => {
    it("filters in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();

      const inAppAgentKey = await createApiKey(prisma, {
        owner: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId("user-1"),
        name: "In-app agent key hidden from project UI",
        isInAppAgentKey: true,
      });

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });

      expect(apiKeys.map((key) => key.id)).not.toContain(inAppAgentKey.id);
      expect(apiKeys.map((key) => key.note)).not.toContain(
        "In-app agent key hidden from project UI",
      );
    });

    // The settings page gates the list view on apiKeys:read, which MEMBERs
    // hold without apiKeys:CUD. Pin that this read path stays open to them.
    it("lists keys for MEMBER callers, who only hold apiKeys:read", async () => {
      const { caller, projectId, publicKey } =
        await createProjectCaller("MEMBER");

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });

      expect(apiKeys.map((key) => key.publicKey)).toContain(publicKey);
    });
  });

  describe("projectApiKeys.create", () => {
    it("stores the creating user and returns it in the list", async () => {
      const { caller, projectId } = await createProjectCaller();

      const apiKeyResult = await caller.projectApiKeys.create({
        projectId,
        name: "Key for creator attribution test",
      });

      const dbKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: apiKeyResult.id },
      });
      expect(dbKey.createdByUserId).toBe("user-1");
      expect(dbKey.createdByApiKeyId).toBeNull();
      expect(
        await prisma.roleAssignment.findFirstOrThrow({
          where: { apiKeyId: apiKeyResult.id },
        }),
      ).toMatchObject({ systemRole: "LEGACY_PROJECT_API_KEY" });
      expect(dbKey.scope).toBe("PROJECT");
      expect(dbKey.projectId).toBe(projectId);
      expect(dbKey.orgId).toBeNull();

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });
      const listedKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(listedKey?.createdByUser?.id).toBe("user-1");
      expect(listedKey?.createdByApiKey).toBeNull();
    });

    it("rejects an expiration date in the past", async () => {
      const { caller, projectId } = await createProjectCaller();

      await expect(
        caller.projectApiKeys.create({
          projectId,
          expiresAt: new Date(Date.now() - 60_000),
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("rejects users without apiKeys:CUD access", async () => {
      const { caller, projectId } = await createProjectCaller("MEMBER");

      await expect(
        caller.projectApiKeys.create({
          projectId,
          name: "Unauthorized migration key",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });

      await expect(
        prisma.apiKey.count({
          where: { projectId, note: "Unauthorized migration key" },
        }),
      ).resolves.toBe(0);
    });

    // A project key whose role grants no project-kind actions (e.g. the
    // org-only AI Gateway role) would grant nothing on the project it is
    // scoped to, so it is not among the roles the create input accepts.
    it("rejects an organization-only role on a project key", async () => {
      Object.assign(env, { API_KEY_PROJECT_ROLES_ENABLE: "true" });
      const { caller, projectId } = await createProjectCaller();

      await expect(
        caller.projectApiKeys.create({
          projectId,
          name: "org-only role on project key",
          role: "AI_GATEWAY",
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await expect(
        prisma.apiKey.count({
          where: { projectId, note: "org-only role on project key" },
        }),
      ).resolves.toBe(0);
    });

    it.each(["ADMIN", "VIEWER", "INGEST", "SCORES_INGEST"] as const)(
      "creates a project key with %s when role selection is enabled",
      async (role) => {
        Object.assign(env, { API_KEY_PROJECT_ROLES_ENABLE: "true" });
        const { caller, projectId } = await createProjectCaller();
        const key = await caller.projectApiKeys.create({ projectId, role });
        const assignment = await prisma.roleAssignment.findFirstOrThrow({
          where: { apiKeyId: key.id },
        });
        expect(assignment.systemRole).toBe(role);
        expect(assignment.projectId).toBe(projectId);
      },
    );

    describe.each([
      { migration: "legacy", enabled: "false" },
      { migration: "legacy", enabled: "true" },
      { migration: "shadow", enabled: "false" },
      { migration: "shadow", enabled: "true" },
      { migration: "enforce", enabled: "false" },
      { migration: "enforce", enabled: "true" },
    ])(
      "role creation with $migration and exposure $enabled",
      ({ migration, enabled }) => {
        beforeEach(() => {
          Object.assign(env, {
            API_AUTH_MIGRATION: migration,
            API_KEY_PROJECT_ROLES_ENABLE: enabled,
            API_KEY_ORG_ROLES_ENABLE: "true",
          });
        });

        it.each([{}, { role: undefined }, { role: null }])(
          "defaults %j to the legacy role",
          async (input) => {
            const { caller, projectId } = await createProjectCaller();
            const key = await caller.projectApiKeys.create({
              projectId,
              ...input,
            });
            expect(
              await prisma.roleAssignment.findFirstOrThrow({
                where: { apiKeyId: key.id },
              }),
            ).toMatchObject({
              systemRole: "LEGACY_PROJECT_API_KEY",
              projectId: projectId,
            });
          },
        );

        it("rejects explicit legacy, empty, invalid and disabled roles without creating keys", async () => {
          const { caller, projectId } = await createProjectCaller();
          const before = await prisma.apiKey.count({ where: { projectId } });
          const rejectedRoles = [
            "LEGACY_PROJECT_API_KEY",
            "LEGACY_ORGANIZATION_API_KEY",
            "",
            "OWNER",
            "AI_GATEWAY",
            "invalid",
          ];
          if (migration !== "enforce" || enabled === "false")
            rejectedRoles.push("ADMIN", "VIEWER", "INGEST", "SCORES_INGEST");
          for (const role of rejectedRoles) {
            await expect(
              caller.projectApiKeys.create({ projectId, role: role as never }),
            ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          }
          expect(await prisma.apiKey.count({ where: { projectId } })).toBe(
            before,
          );
        });
      },
    );
  });

  describe("projectApiKeys.updateName", () => {
    it("returns NOT_FOUND for a missing API key", async () => {
      const { caller, projectId } = await createProjectCaller();

      await expect(
        caller.projectApiKeys.updateName({
          projectId,
          keyId: randomUUID(),
          name: "Updated Note",
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("does not update in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();
      const inAppAgentKey = await createApiKey(prisma, {
        owner: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId("user-1"),
        name: "Original in-app agent note",
        isInAppAgentKey: true,
      });

      await expect(
        caller.projectApiKeys.updateName({
          projectId,
          keyId: inAppAgentKey.id,
          name: "Updated in-app agent note",
        }),
      ).rejects.toThrow();

      const persistedKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: inAppAgentKey.id },
      });
      expect(persistedKey.note).toBe("Original in-app agent note");
    });
  });

  describe("system role assignments", () => {
    it("writes a LEGACY_PROJECT_API_KEY assignment on create and revokes it on delete", async () => {
      const { caller, projectId } = await createProjectCaller();

      const key = await createApiKey(prisma, {
        owner: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId("user-1"),
        name: "Key for role assignment test",
      });

      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { orgId: true },
      });

      const assignment = await prisma.roleAssignment.findFirstOrThrow({
        where: { apiKeyId: key.id },
      });
      expect(assignment.systemRole).toBe("LEGACY_PROJECT_API_KEY");
      expect(assignment.projectId).toBe(projectId);
      expect(assignment.orgId).toBe(project.orgId);

      await expect(
        caller.projectApiKeys.delete({ projectId, id: key.id }),
      ).resolves.toBe(true);

      await expect(
        prisma.roleAssignment.count({
          where: { apiKeyId: key.id },
        }),
      ).resolves.toBe(0);
    });
  });

  describe("projectApiKeys.delete", () => {
    it("returns NOT_FOUND for a missing API key", async () => {
      const { caller, projectId } = await createProjectCaller();

      await expect(
        caller.projectApiKeys.delete({
          projectId,
          id: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("does not delete in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();
      const inAppAgentKey = await createApiKey(prisma, {
        owner: ProjectId(projectId),
        role: SystemRoleId("LEGACY_PROJECT_API_KEY"),
        createdBy: UserId("user-1"),
        isInAppAgentKey: true,
      });

      await expect(
        caller.projectApiKeys.delete({
          projectId,
          id: inAppAgentKey.id,
        }),
      ).resolves.toBe(false);

      await expect(
        prisma.apiKey.findUniqueOrThrow({ where: { id: inAppAgentKey.id } }),
      ).resolves.toBeDefined();
    });
  });
});
