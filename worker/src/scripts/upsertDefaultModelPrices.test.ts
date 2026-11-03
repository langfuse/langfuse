import { beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import { matchPricingTier, UsageDetails } from "@langfuse/shared/src/server";

const transaction = vi.hoisted(() => vi.fn());

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { $transaction: transaction },
}));

import {
  type DefaultModelPrice,
  upsertModelWithTiers,
} from "./upsertDefaultModelPrices";
import defaultModelPrices from "../constants/default-model-prices.json";

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

describe("default GPT-5.4 mini and nano prices", () => {
  it("prices all reasoning aliases at each tier's output rate", () => {
    const expectedStandardOutputPrices = {
      "gpt-5.4-mini": 4.5e-6,
      "gpt-5.4-mini-2026-03-17": 4.5e-6,
      "gpt-5.4-nano": 1.25e-6,
      "gpt-5.4-nano-2026-03-17": 1.25e-6,
    };

    for (const [modelName, expectedStandardOutputPrice] of Object.entries(
      expectedStandardOutputPrices,
    )) {
      const model = defaultModelPrices.find(
        (defaultModel) => defaultModel.modelName === modelName,
      );

      expect(model, modelName).toBeDefined();
      if (!model) continue;

      for (const tier of model.pricingTiers) {
        expect(tier.prices, `${modelName}/${tier.name}`).toMatchObject({
          output_reasoning_tokens: tier.prices.output,
          output_reasoning: tier.prices.output,
          reasoning_tokens: tier.prices.output,
        });
      }

      const standardTier = model.pricingTiers.find((tier) => tier.isDefault);
      expect(standardTier?.prices.output, modelName).toBe(
        expectedStandardOutputPrice,
      );
    }
  });
});

describe("default OpenAI cache-write prices", () => {
  it.each([
    { modelName: "gpt-5.4-mini", cacheWritePrice: 0.75e-6 },
    { modelName: "gpt-5.4-mini-2026-03-17", cacheWritePrice: 0.75e-6 },
    { modelName: "gpt-5.5-2026-04-23", cacheWritePrice: 5e-6 },
    { modelName: "gpt-4.1", cacheWritePrice: 2e-6 },
    { modelName: "gpt-5.6-sol", cacheWritePrice: 5e-6 },
    { modelName: "gpt-6-sol", cacheWritePrice: 2.5e-6 },
  ])(
    "prices Responses API cache writes for $modelName",
    ({ modelName, cacheWritePrice }) => {
      const model = defaultModelPrices.find(
        (defaultModel) => defaultModel.modelName === modelName,
      );
      expect(model).toBeDefined();
      if (!model) return;

      const usageDetails = UsageDetails.parse({
        input_tokens: 230_000,
        output_tokens: 1_000,
        total_tokens: 231_000,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 227_060 },
      }) as Record<string, number>;

      const match = matchPricingTier(
        model.pricingTiers.map((tier) => ({
          ...tier,
          conditions:
            tier.conditions as DefaultModelPrice["pricingTiers"][number]["conditions"],
          prices: Object.entries(tier.prices).map(([usageType, price]) => ({
            usageType,
            price: new Decimal(price),
          })),
        })),
        usageDetails,
      );
      expect(match?.pricingTierName).toBe("Standard");

      const unpricedUsageKeys = Object.keys(usageDetails).filter(
        (usageType) => usageType !== "total" && !match?.prices[usageType],
      );
      expect(unpricedUsageKeys).toEqual([]);
      expect(match?.prices.input_cache_write_tokens?.toNumber()).toBe(
        cacheWritePrice,
      );
    },
  );

  it.each(["gpt-5.4", "gpt-5.4-2026-03-05", "gpt-5.5-2026-04-23"])(
    "counts flat cache writes toward the %s large-context threshold",
    (modelName) => {
      const model = defaultModelPrices.find(
        (defaultModel) => defaultModel.modelName === modelName,
      );
      expect(model).toBeDefined();
      if (!model) return;

      const match = matchPricingTier(
        model.pricingTiers.map((tier) => ({
          ...tier,
          conditions:
            tier.conditions as DefaultModelPrice["pricingTiers"][number]["conditions"],
          prices: Object.entries(tier.prices).map(([usageType, price]) => ({
            usageType,
            price: new Decimal(price),
          })),
        })),
        { input: 100_000, cache_write_tokens: 200_000, output: 1_000 },
      );
      expect(match?.pricingTierName).toBe("Large Context (>272K)");
    },
  );
});

describe("default Gemini Pro pricing tiers", () => {
  it.each([
    {
      modelName: "gemini-3.1-pro-preview",
      standard: [2e-6, 12e-6, 0.2e-6],
      standardLarge: [4e-6, 18e-6, 0.4e-6],
      priority: [3.6e-6, 21.6e-6, 0.36e-6],
      priorityLarge: [7.2e-6, 32.4e-6, 0.72e-6],
    },
    {
      modelName: "gemini-2.5-pro",
      standard: [1.25e-6, 10e-6, 0.125e-6],
      standardLarge: [2.5e-6, 15e-6, 0.25e-6],
      priority: [2.25e-6, 18e-6, 0.225e-6],
      priorityLarge: [4.5e-6, 27e-6, 0.45e-6],
    },
  ])(
    "selects $modelName tiers at the cached-input context boundary",
    (expected) => {
      const model = defaultModelPrices.find(
        ({ modelName }) => modelName === expected.modelName,
      );
      expect(model).toBeDefined();
      if (!model) return;

      const tiers = model.pricingTiers.map((tier) => ({
        ...tier,
        conditions:
          tier.conditions as DefaultModelPrice["pricingTiers"][number]["conditions"],
        prices: Object.entries(tier.prices).map(([usageType, price]) => ({
          usageType,
          price: new Decimal(price),
        })),
      }));

      for (const cachedTokens of [50_000, 50_001]) {
        const largeContext = cachedTokens > 50_000;
        for (const serviceTier of ["priority", "standard", undefined]) {
          const priority = serviceTier === "priority";
          const expectedPrices = priority
            ? largeContext
              ? expected.priorityLarge
              : expected.priority
            : largeContext
              ? expected.standardLarge
              : expected.standard;
          const match = matchPricingTier(
            tiers,
            {
              input: 150_000,
              input_cached_tokens: cachedTokens,
              output: 1_000,
            },
            {
              modelParameters: serviceTier ? { service_tier: serviceTier } : {},
            },
          );

          expect(match?.pricingTierName).toBe(
            priority
              ? largeContext
                ? "Priority Large Context"
                : "Priority"
              : largeContext
                ? "Large Context"
                : "Standard",
          );
          expect(
            ["input", "output", "input_cached_tokens"].map((usageType) =>
              match?.prices[usageType].toNumber(),
            ),
          ).toEqual(expectedPrices);
        }
      }
    },
  );
});
