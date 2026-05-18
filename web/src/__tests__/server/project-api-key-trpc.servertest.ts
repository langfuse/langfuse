import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import {
  createAndAddApiKeysToDb,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";

describe("project API keys trpc", () => {
  describe("projectApiKeys.byProjectId", () => {
    it("filters in-app agent API keys", async () => {
      const { projectId, orgId } = await createOrgProjectAndApiKey();

      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: projectId,
        scope: "PROJECT",
        note: "In-app agent key hidden from project UI",
        isInAppAgentKey: true,
      });

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

      const apiKeys = await caller.projectApiKeys.byProjectId({ projectId });

      expect(apiKeys.map((key) => key.id)).not.toContain(inAppAgentKey.id);
      expect(apiKeys.map((key) => key.note)).not.toContain(
        "In-app agent key hidden from project UI",
      );
    });
  });
});
