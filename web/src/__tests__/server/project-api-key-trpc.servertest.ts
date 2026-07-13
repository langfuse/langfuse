import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

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

  async function createProjectCaller() {
    const { projectId, orgId } = await createOrgProjectAndApiKey();

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
            projects: [
              {
                id: projectId,
                role: "ADMIN",
                retentionDays: 30,
                deletedAt: null,
                name: "Test Project",
              },
            ],
          },
        ],
        featureFlags: {
          excludeClickhouseRead: false,
          templateFlag: true,
        },
        admin: false,
      },
      environment: {} as any,
    };

    const ctx = createInnerTRPCContext({ session });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    return { caller, projectId };
  }

  describe("projectApiKeys.byProjectId", () => {
    it("filters in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();

      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        note: "In-app agent key hidden from project UI",
        isInAppAgentKey: true,
      });

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });

      expect(apiKeys.map((key) => key.id)).not.toContain(inAppAgentKey.id);
      expect(apiKeys.map((key) => key.note)).not.toContain(
        "In-app agent key hidden from project UI",
      );
    });
  });

  describe("projectApiKeys.create", () => {
    it("stores the creating user and returns it in the list", async () => {
      const { caller, projectId } = await createProjectCaller();

      const apiKeyResult = await caller.projectApiKeys.create({
        projectId,
        note: "Key for creator attribution test",
      });

      const dbKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: apiKeyResult.id },
      });
      expect(dbKey.createdByUserId).toBe("user-1");
      expect(dbKey.createdByApiKeyId).toBeNull();

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });
      const listedKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(listedKey?.createdByUser?.id).toBe("user-1");
      expect(listedKey?.createdByApiKey).toBeNull();
    });
  });

  describe("projectApiKeys.updateNote", () => {
    it("does not update in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();
      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        note: "Original in-app agent note",
        isInAppAgentKey: true,
      });

      await expect(
        caller.projectApiKeys.updateNote({
          projectId,
          keyId: inAppAgentKey.id,
          note: "Updated in-app agent note",
        }),
      ).rejects.toThrow();

      const persistedKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: inAppAgentKey.id },
      });
      expect(persistedKey.note).toBe("Original in-app agent note");
    });
  });

  describe("projectApiKeys.delete", () => {
    it("does not delete in-app agent API keys", async () => {
      const { caller, projectId } = await createProjectCaller();
      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
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
