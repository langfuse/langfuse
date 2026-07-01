import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("project API keys trpc", () => {
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
