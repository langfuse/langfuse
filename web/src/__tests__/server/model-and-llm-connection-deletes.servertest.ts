import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const buildSession = (orgId: string, projectId: string): Session => ({
  expires: "1",
  user: {
    id: "user-1",
    name: "Demo User",
    canCreateOrganizations: true,
    organizations: [
      {
        id: orgId,
        role: "OWNER",
        plan: "cloud:hobby",
        cloudConfig: undefined,
        name: "Test Organization",
        metadata: {},
        aiFeaturesEnabled: false,
        aiTelemetryEnabled: false,
        projects: [
          {
            id: projectId,
            role: "ADMIN",
            name: "Test Project",
            deletedAt: null,
            retentionDays: null,
            hasTraces: false,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    featureFlags: {
      searchBar: false,
      templateFlag: true,
      excludeClickhouseRead: false,
      observationEvals: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    admin: true,
  },
  environment: {} as any,
});

describe("missing-record deletes map to NOT_FOUND", () => {
  let projectId: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    const ctx = createInnerTRPCContext({
      session: buildSession(setup.orgId, setup.projectId),
      headers: {},
    });
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

  it("returns NOT_FOUND when deleting a model that is already gone", async () => {
    await expect(
      caller.models.delete({
        projectId,
        modelId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when deleting an LLM API key that is already gone", async () => {
    await expect(
      caller.llmApiKey.delete({
        projectId,
        id: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when deleting a default eval model that is already gone", async () => {
    await expect(
      caller.defaultLlmModel.deleteDefaultModel({ projectId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
