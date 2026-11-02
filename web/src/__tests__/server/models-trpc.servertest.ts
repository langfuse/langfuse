import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

const createCaller = async () => {
  const { project, org } = await createOrgProjectAndApiKey({ plan: "Team" });
  const session: Session = {
    expires: "1",
    user: {
      id: `user-${randomUUID()}`,
      name: "Models Test User",
      canCreateOrganizations: true,
      admin: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan: "cloud:team",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: false,
          projects: [
            {
              id: project.id,
              role: "ADMIN",
              retentionDays: 30,
              deletedAt: null,
              name: project.name,
              hasTraces: true,
              metadata: {},
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      featureFlags: testFeatureFlags(),
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  return {
    projectId: project.id,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
};

describe("models tRPC router", () => {
  // The public API and the shared pricing-tier schema accept any string as a
  // usage key, so rows written through them must stay readable here.
  it("lists and reads models whose usage keys contain dots", async () => {
    const { projectId, caller } = await createCaller();
    const modelName = `dotted-keys-${randomUUID()}`;
    const prices = {
      input: 0.000001,
      "input.cached": 0.0000005,
      "output.reasoning-tokens": 0,
    };

    const { id: modelId } = await caller.models.upsert({
      modelId: null,
      projectId,
      modelName,
      matchPattern: `(?i)^(${modelName})$`,
      pricingTiers: [
        {
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices,
        },
      ],
    });

    const list = await caller.models.getAll({
      projectId,
      searchString: modelName,
      page: 0,
      limit: 50,
    });

    expect(list.totalCount).toBe(1);
    expect(list.models).toHaveLength(1);
    expect(list.models[0].pricingTiers[0].prices).toEqual(prices);

    const model = await caller.models.getById({ projectId, modelId });
    expect(model.pricingTiers[0].prices).toEqual(prices);
  });
});
