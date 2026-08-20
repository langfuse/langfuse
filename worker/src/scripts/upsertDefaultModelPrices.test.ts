import { beforeEach, describe, expect, it, vi } from "vitest";

const transaction = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { $transaction: transaction },
}));

import {
  type DefaultModelPrice,
  upsertModelWithTiers,
} from "./upsertDefaultModelPrices";

describe("upsertModelWithTiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("vacates existing priorities before applying a reordered tier layout", async () => {
    const calls: string[] = [];
    const tx = {
      model: {
        upsert: vi.fn().mockImplementation(() => {
          calls.push("model.upsert");
        }),
      },
      pricingTier: {
        deleteMany: vi.fn(),
        update: vi.fn().mockImplementation(({ data }) => {
          calls.push(`tier.update:${data.priority}`);
        }),
        upsert: vi.fn().mockImplementation(({ create }) => {
          calls.push(`tier.upsert:${create.priority}`);
        }),
      },
      price: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn(),
        upsert: vi.fn(),
      },
    };

    transaction.mockImplementation(
      async (callback: (client: typeof tx) => Promise<void>) => callback(tx),
    );

    const model = {
      id: "model-id",
      modelName: "Model",
      matchPattern: "(?i)^model$",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-02-01"),
      tokenizerConfig: null,
      tokenizerId: null,
      pricingTiers: [
        {
          id: "standard",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: {},
        },
        {
          id: "priority",
          name: "Priority",
          isDefault: false,
          priority: 1,
          conditions: [],
          prices: {},
        },
        {
          id: "large-context",
          name: "Large Context",
          isDefault: false,
          priority: 2,
          conditions: [],
          prices: {},
        },
      ],
    } satisfies DefaultModelPrice;

    await upsertModelWithTiers(model, {
      updatedAt: new Date("2026-01-01"),
      tiers: [
        {
          id: "standard",
          name: "Standard",
          priority: 0,
          isDefault: true,
        },
        {
          id: "large-context",
          name: "Large Context",
          priority: 1,
          isDefault: false,
        },
      ],
    });

    expect(calls).toEqual([
      "model.upsert",
      "tier.update:3",
      "tier.update:4",
      "tier.upsert:0",
      "tier.upsert:1",
      "tier.upsert:2",
    ]);
  });
});
