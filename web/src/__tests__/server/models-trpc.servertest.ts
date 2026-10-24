import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const defaultPricingTier = {
  name: "Standard",
  isDefault: true,
  priority: 0,
  conditions: [],
  prices: { input: 0.001, output: 0.002 },
};

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
      langfuseTopics: false,
    },
    admin: true,
  },
  environment: {} as any,
});

describe("models.upsert", () => {
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

  it("creates a model and then updates its match pattern", async () => {
    const modelName = `upsert-model-${randomUUID()}`;

    const created = await caller.models.upsert({
      modelId: null,
      projectId,
      modelName,
      matchPattern: `^${modelName}$`,
      pricingTiers: [defaultPricingTier],
    });

    expect(created.modelName).toBe(modelName);
    expect(created.projectId).toBe(projectId);

    const updated = await caller.models.upsert({
      modelId: created.id,
      projectId,
      modelName,
      matchPattern: `^(?:${modelName})$`,
      pricingTiers: [defaultPricingTier],
    });

    expect(updated.id).toBe(created.id);
    expect(updated.matchPattern).toBe(`^(?:${modelName})$`);
  });

  it("rejects a second project model with the same name", async () => {
    const modelName = `upsert-dup-${randomUUID()}`;

    await caller.models.upsert({
      modelId: null,
      projectId,
      modelName,
      matchPattern: `^${modelName}$`,
      pricingTiers: [defaultPricingTier],
    });

    await expect(
      caller.models.upsert({
        modelId: null,
        projectId,
        modelName,
        matchPattern: `^${modelName}-alt$`,
        pricingTiers: [defaultPricingTier],
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: `Model name '${modelName}' already exists in project`,
    });
  });
});
