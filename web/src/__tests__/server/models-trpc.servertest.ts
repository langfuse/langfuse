import type { Session } from "next-auth";
import { randomUUID } from "crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const createCaller = async () => {
  const { project, org } = await createOrgProjectAndApiKey({ plan: "Team" });
  const session: Session = createSession({
    user: { id: `user-${randomUUID()}`, name: "Models Test User" },
    organizations: [
      {
        id: org.id,
        role: "OWNER",
        name: org.name,
        plan: "cloud:team",
        projects: [
          {
            id: project.id,
            role: "ADMIN",
            name: project.name,
            hasTraces: true,
          },
        ],
      },
    ],
  });

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
