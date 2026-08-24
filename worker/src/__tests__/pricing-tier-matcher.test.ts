import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { validateRegexPattern } from "@langfuse/shared";
import {
  hasPricingTierUsageDetails,
  matchPricingTier,
  type PricingTierWithPrices,
} from "@langfuse/shared/src/server";
import { DefaultModelPriceSchema } from "../scripts/upsertDefaultModelPrices";
import defaultModelPrices from "../constants/default-model-prices.json";

describe("hasPricingTierUsageDetails", () => {
  it("requires at least one usage detail, including zero-valued details", () => {
    expect(hasPricingTierUsageDetails(undefined)).toBe(false);
    expect(hasPricingTierUsageDetails({})).toBe(false);
    expect(hasPricingTierUsageDetails({ input: 0 })).toBe(true);
  });
});

describe("default-model-prices.json", () => {
  it("should parse successfully with Zod schema (same validation as upsertDefaultModelPrices)", () => {
    expect(() =>
      z.array(DefaultModelPriceSchema).parse(defaultModelPrices),
    ).not.toThrow();
  });

  it("should have unique model IDs", () => {
    const ids = defaultModelPrices.map((model) => model.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("should have unique pricing tier IDs globally", () => {
    const allTierIds: string[] = [];
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        allTierIds.push(tier.id);
      }
    }
    const uniqueTierIds = new Set(allTierIds);
    expect(allTierIds.length).toBe(uniqueTierIds.size);
  });

  it("should have unique model names", () => {
    const modelNames = defaultModelPrices.map((model) => model.modelName);
    const uniqueNames = new Set(modelNames);
    expect(modelNames.length).toBe(uniqueNames.size);
  });

  it("should have updatedAt greater than or equal to createdAt", () => {
    for (const model of defaultModelPrices) {
      const created = new Date(model.createdAt);
      const updated = new Date(model.updatedAt);
      expect(updated.getTime()).toBeGreaterThanOrEqual(created.getTime());
    }
  });

  it("should have valid date formats for all timestamps", () => {
    for (const model of defaultModelPrices) {
      const created = new Date(model.createdAt);
      const updated = new Date(model.updatedAt);
      expect(created.toString()).not.toBe("Invalid Date");
      expect(updated.toString()).not.toBe("Invalid Date");
    }
  });

  it("should have at least one pricing tier per model", () => {
    for (const model of defaultModelPrices) {
      expect(model.pricingTiers.length).toBeGreaterThan(0);
    }
  });

  it("should have exactly one default tier per model", () => {
    for (const model of defaultModelPrices) {
      const defaultTiers = model.pricingTiers.filter((t) => t.isDefault);
      expect(defaultTiers.length).toBe(1);
    }
  });

  it("should have default tier with priority 0 and no conditions", () => {
    for (const model of defaultModelPrices) {
      const defaultTier = model.pricingTiers.find((t) => t.isDefault);
      expect(defaultTier).toBeDefined();
      expect(defaultTier!.priority).toBe(0);
      expect(defaultTier!.conditions).toEqual([]);
    }
  });

  it("should have default tier IDs in the form of ${modelId}_tier_default", () => {
    for (const model of defaultModelPrices) {
      const defaultTier = model.pricingTiers.find((t) => t.isDefault);
      expect(defaultTier).toBeDefined();
      const expectedId = `${model.id}_tier_default`;
      expect(defaultTier!.id).toBe(expectedId);
    }
  });

  it("should have unique priorities within each model", () => {
    for (const model of defaultModelPrices) {
      const priorities = model.pricingTiers.map((t) => t.priority);
      const uniquePriorities = new Set(priorities);
      expect(priorities.length).toBe(uniquePriorities.size);
    }
  });

  it("should have unique tier names within each model", () => {
    for (const model of defaultModelPrices) {
      const names = model.pricingTiers.map((t) => t.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    }
  });

  it("should have non-negative priority values", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        expect(tier.priority).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("should have integer priority values", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        expect(Number.isInteger(tier.priority)).toBe(true);
      }
    }
  });

  it("should have at least one price per tier", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        expect(Object.keys(tier.prices).length).toBeGreaterThan(0);
      }
    }
  });

  it("should have non-negative price values", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        for (const [usageType, price] of Object.entries(tier.prices)) {
          expect(price).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("should have valid number values for all prices (no NaN or Infinity)", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        for (const [usageType, price] of Object.entries(tier.prices)) {
          expect(Number.isFinite(price)).toBe(true);
        }
      }
    }
  });

  it("should have same price keys across all tiers within a model", () => {
    for (const model of defaultModelPrices) {
      if (model.pricingTiers.length <= 1) continue;

      const defaultTier = model.pricingTiers.find((t) => t.isDefault);
      expect(defaultTier).toBeDefined();

      const defaultKeys = Object.keys(defaultTier!.prices).sort();

      for (const tier of model.pricingTiers) {
        if (tier.isDefault) continue;

        const tierKeys = Object.keys(tier.prices).sort();
        expect(tierKeys).toEqual(defaultKeys);
      }
    }
  });

  it("should have valid condition structures for non-default tiers", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        if (tier.isDefault) continue;

        // Non-default tiers must have at least one condition
        expect(tier.conditions.length).toBeGreaterThan(0);

        for (const condition of tier.conditions) {
          expect(condition).toHaveProperty("operator");
          if ("usageDetailPattern" in condition) {
            expect(condition).toHaveProperty("value");
            expect(["gt", "gte", "lt", "lte", "eq", "neq"]).toContain(
              condition.operator,
            );
            expect(typeof condition.value).toBe("number");
            expect(typeof condition.caseSensitive).toBe("boolean");
            expect(typeof condition.usageDetailPattern).toBe("string");
            expect(condition.usageDetailPattern.length).toBeGreaterThan(0);
            expect(condition.usageDetailPattern.length).toBeLessThanOrEqual(
              200,
            );
          } else {
            expect(["model_parameters", "metadata"]).toContain(
              condition.source,
            );
            expect(condition).toHaveProperty("key");
            expect(condition.operator).toBe("in");
            expect(condition.values).toEqual(
              expect.arrayContaining([expect.any(String)]),
            );
          }
        }
      }
    }
  });

  it("should have valid regex patterns in all conditions", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        for (const condition of tier.conditions) {
          const pattern =
            "usageDetailPattern" in condition
              ? condition.usageDetailPattern
              : null;
          if (pattern !== null) {
            expect(() => validateRegexPattern(pattern)).not.toThrow();
          }
        }
      }
    }
  });

  it("should match AWS geographic inference profiles for Claude Haiku 4.5", () => {
    const claudeModel = defaultModelPrices.find(
      (model) => model.modelName === "claude-haiku-4-5-20251001",
    );
    expect(claudeModel).toBeDefined();

    expect(claudeModel!.matchPattern).toContain(
      "(eu\\.|us\\.|apac\\.|au\\.|jp\\.|global\\.)?anthropic\\.claude-haiku-4-5-20251001-v1:0",
    );
  });

  it("should consistently support JP and AU prefixes for Anthropic Bedrock models", () => {
    const bedrockModels = defaultModelPrices.filter((model) =>
      model.matchPattern.includes("anthropic\\.claude"),
    );
    expect(bedrockModels.length).toBeGreaterThan(0);

    for (const model of bedrockModels) {
      expect(model.matchPattern, model.modelName).toContain(
        "(eu\\.|us\\.|apac\\.|au\\.|jp\\.|global\\.)?anthropic\\.claude",
      );
    }
  });

  it("should correctly match claude-sonnet-4-5 with standard pricing", () => {
    const claudeModel = defaultModelPrices.find(
      (m) => m.id === "c5qmrqolku82tra3vgdixmys",
    );
    expect(claudeModel).toBeDefined();
    expect(claudeModel!.modelName).toBe("claude-sonnet-4-5-20250929");
    expect(claudeModel!.pricingTiers.length).toBe(1);

    // Convert to PricingTierWithPrices format
    const tiers: PricingTierWithPrices[] = claudeModel!.pricingTiers.map(
      (tier) => ({
        id: tier.id,
        name: tier.name,
        isDefault: tier.isDefault,
        priority: tier.priority,
        conditions: tier.conditions,
        prices: Object.entries(tier.prices).map(([usageType, price]) => ({
          usageType,
          price: new Decimal(price),
        })),
      }),
    );

    const standardResult = matchPricingTier(tiers, {
      input: 150000,
      output: 5000,
    });
    expect(standardResult).not.toBeNull();
    expect(standardResult?.pricingTierName).toBe("Standard");
    expect(standardResult?.prices.input.toNumber()).toBe(0.000003);
  });

  it("should price Gemini 3 Google Search grounding queries", () => {
    const gemini3ModelNames = [
      "gemini-3-pro-preview",
      "gemini-3.1-pro-preview",
      "gemini-3.5-flash",
      "gemini-3-flash-preview",
      "gemini-3.1-flash-lite",
      "gemini-3.1-flash-lite-preview",
    ];
    const groundingUsageKeys = [
      "grounding_queries",
      "groundingQueries",
      "web_search_queries",
      "webSearchQueries",
    ];

    for (const modelName of gemini3ModelNames) {
      const model = defaultModelPrices.find((m) => m.modelName === modelName);
      expect(model, modelName).toBeDefined();

      for (const tier of model!.pricingTiers) {
        for (const usageKey of groundingUsageKeys) {
          expect(tier.prices[usageKey], `${modelName}/${usageKey}`).toBe(14e-3);
        }
      }
    }
  });

  it("should price GPT-5.6 usage aliases across context and service tiers", () => {
    const modelNames = ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];

    for (const modelName of modelNames) {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === modelName,
      );
      expect(model, modelName).toBeDefined();
      expect(model!.pricingTiers.map((tier) => tier.name)).toEqual([
        "Standard",
        "Fast mode · Large context (>272K)",
        "Flex · Large context (>272K)",
        "Fast mode",
        "Flex",
        "Large Context (>272K)",
      ]);

      for (const tier of model!.pricingTiers) {
        const prices = tier.prices as Record<string, number>;
        expect(prices.cache_read_input_tokens).toBe(prices.input_cached_tokens);
        expect(prices.reasoning_tokens).toBe(prices.output_reasoning_tokens);
        expect(prices.input_cache_creation).toBeCloseTo(
          prices.input * 1.25,
          15,
        );
        expect(prices.cache_write_tokens).toBeCloseTo(prices.input * 1.25, 15);
      }
    }

    const sol = defaultModelPrices.find(
      (model) => model.modelName === "gpt-5.6-sol",
    );
    expect(sol).toBeDefined();

    const tiers: PricingTierWithPrices[] = sol!.pricingTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      isDefault: tier.isDefault,
      priority: tier.priority,
      conditions: tier.conditions,
      prices: Object.entries(tier.prices).map(([usageType, price]) => ({
        usageType,
        price: new Decimal(price),
      })),
    }));

    const reportedUsage = {
      input: 786,
      cache_read_input_tokens: 718398,
      output: 242,
      reasoning_tokens: 25,
    };
    const reportedResult = matchPricingTier(tiers, reportedUsage);
    expect(reportedResult?.pricingTierName).toBe("Large Context (>272K)");

    const reportedCost = Object.entries(reportedUsage).reduce(
      (total, [usageType, units]) =>
        total + (reportedResult?.prices[usageType]?.toNumber() ?? 0) * units,
      0,
    );
    expect(reportedCost).toBeCloseTo(0.738273, 12);

    expect(
      matchPricingTier(tiers, { cache_write_tokens: 272001 })?.pricingTierName,
    ).toBe("Large Context (>272K)");

    expect(
      matchPricingTier(
        tiers,
        { cache_write_tokens: 272001 },
        { modelParameters: { service_tier: "priority" } },
      )?.pricingTierName,
    ).toBe("Fast mode · Large context (>272K)");

    expect(
      matchPricingTier(
        tiers,
        { cache_write_tokens: 272001 },
        { modelParameters: { service_tier: "fast" } },
      )?.pricingTierName,
    ).toBe("Fast mode · Large context (>272K)");

    expect(
      matchPricingTier(
        tiers,
        { input: 1000 },
        { modelParameters: { service_tier: "priority" } },
      )?.pricingTierName,
    ).toBe("Fast mode");

    expect(
      matchPricingTier(
        tiers,
        { input: 1000 },
        { modelParameters: { service_tier: "fast" } },
      )?.pricingTierName,
    ).toBe("Fast mode");

    expect(
      matchPricingTier(
        tiers,
        { input: 1000 },
        { modelParameters: { service_tier: "flex" } },
      )?.pricingTierName,
    ).toBe("Flex");

    expect(
      matchPricingTier(
        tiers,
        { cache_write_tokens: 272001 },
        { modelParameters: { service_tier: "flex" } },
      )?.pricingTierName,
    ).toBe("Flex · Large context (>272K)");
  });

  it("should price GPT-5.4 mini and nano reasoning tokens at the output rate", () => {
    const modelNames = [
      "gpt-5.4-mini",
      "gpt-5.4-mini-2026-03-17",
      "gpt-5.4-nano",
      "gpt-5.4-nano-2026-03-17",
    ];

    for (const modelName of modelNames) {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === modelName,
      );
      expect(model, modelName).toBeDefined();

      for (const tier of model!.pricingTiers) {
        const prices = tier.prices as Record<string, number>;
        expect(
          prices.output_reasoning_tokens,
          `${modelName}/${tier.name}`,
        ).toBe(prices.output);
        expect(prices.output_reasoning, `${modelName}/${tier.name}`).toBe(
          prices.output,
        );
        expect(prices.reasoning_tokens, `${modelName}/${tier.name}`).toBe(
          prices.output,
        );
      }
    }

    const mini = defaultModelPrices.find(
      (model) => model.modelName === "gpt-5.4-mini",
    );
    expect(mini).toBeDefined();

    const miniTiers: PricingTierWithPrices[] = mini!.pricingTiers.map(
      (tier) => ({
        id: tier.id,
        name: tier.name,
        isDefault: tier.isDefault,
        priority: tier.priority,
        conditions: tier.conditions,
        prices: Object.entries(tier.prices).map(([usageType, price]) => ({
          usageType,
          price: new Decimal(price),
        })),
      }),
    );

    const reportedUsage = {
      input: 1932,
      output: 26,
      output_reasoning: 45,
      input_cache_read: 0,
    };
    const reportedResult = matchPricingTier(miniTiers, reportedUsage);
    expect(reportedResult?.pricingTierName).toBe("Standard");

    const reportedCost = Object.entries(reportedUsage).reduce(
      (total, [usageType, units]) =>
        total + (reportedResult?.prices[usageType]?.toNumber() ?? 0) * units,
      0,
    );
    expect(reportedCost).toBeCloseTo(0.0017685, 12);
  });

  it.each(["fast", "priority"])(
    "should match GPT-5.5 Fast mode for the %s service tier value",
    (serviceTier) => {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === "gpt-5.5-2026-04-23",
      );
      expect(model).toBeDefined();

      const tiers: PricingTierWithPrices[] = model!.pricingTiers.map(
        (tier) => ({
          id: tier.id,
          name: tier.name,
          isDefault: tier.isDefault,
          priority: tier.priority,
          conditions: tier.conditions,
          prices: Object.entries(tier.prices).map(([usageType, price]) => ({
            usageType,
            price: new Decimal(price),
          })),
        }),
      );

      expect(
        matchPricingTier(
          tiers,
          { input: 1000 },
          { modelParameters: { service_tier: serviceTier } },
        )?.pricingTierName,
      ).toBe("Fast mode");
    },
  );

  it.each([
    ["gpt-5.4", 5, 30],
    ["gpt-5.4-2026-03-05", 5, 30],
    ["gpt-5.4-mini", 1.5, 9],
    ["gpt-5.4-mini-2026-03-17", 1.5, 9],
    ["gpt-5.2", 3.5, 28],
    ["gpt-5.2-2025-12-11", 3.5, 28],
    ["gpt-5.1", 2.5, 20],
    ["gpt-5.1-2025-11-13", 2.5, 20],
    ["gpt-5", 2.5, 20],
    ["gpt-5-2025-08-07", 2.5, 20],
    ["gpt-5-mini", 0.45, 3.6],
    ["gpt-5-mini-2025-08-07", 0.45, 3.6],
    ["gpt-4.1", 3.5, 14],
    ["gpt-4.1-2025-04-14", 3.5, 14],
    ["gpt-4.1-mini", 0.7, 2.8],
    ["gpt-4.1-mini-2025-04-14", 0.7, 2.8],
    ["gpt-4.1-nano", 0.2, 0.8],
    ["gpt-4.1-nano-2025-04-14", 0.2, 0.8],
    ["gpt-4o", 4.25, 17],
    ["gpt-4o-2024-05-13", 8.75, 26.25],
    ["gpt-4o-2024-08-06", 4.25, 17],
    ["gpt-4o-2024-11-20", 4.25, 17],
    ["gpt-4o-mini", 0.25, 1],
    ["gpt-4o-mini-2024-07-18", 0.25, 1],
    ["o3", 3.5, 14],
    ["o3-2025-04-16", 3.5, 14],
    ["o4-mini", 2, 8],
    ["o4-mini-2025-04-16", 2, 8],
  ])(
    "should price %s Fast mode",
    (modelName, inputPerMillion, outputPerMillion) => {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === modelName,
      );
      const tier = model?.pricingTiers.find(
        (candidate) => candidate.name === "Fast mode",
      );

      expect(tier, modelName).toBeDefined();
      expect(tier?.conditions).toContainEqual({
        source: "model_parameters",
        key: "service_tier",
        operator: "in",
        values: ["fast", "priority"],
      });
      expect(tier?.prices.input).toBeCloseTo(inputPerMillion * 1e-6, 15);
      expect(tier?.prices.output).toBeCloseTo(outputPerMillion * 1e-6, 15);
    },
  );

  it.each([
    ["gpt-5.6-sol", 2.5, 15],
    ["gpt-5.6-terra", 1, 6],
    ["gpt-5.6-luna", 0.1, 0.6],
    ["gpt-5.5-2026-04-23", 2.5, 15],
    ["gpt-5.5-pro-2026-04-23", 15, 90],
    ["gpt-5.4", 1.25, 7.5],
    ["gpt-5.4-2026-03-05", 1.25, 7.5],
    ["gpt-5.4-pro", 15, 90],
    ["gpt-5.4-pro-2026-03-05", 15, 90],
    ["gpt-5.4-mini", 0.375, 2.25],
    ["gpt-5.4-mini-2026-03-17", 0.375, 2.25],
    ["gpt-5.4-nano", 0.1, 0.625],
    ["gpt-5.4-nano-2026-03-17", 0.1, 0.625],
    ["gpt-5.2", 0.875, 7],
    ["gpt-5.2-2025-12-11", 0.875, 7],
    ["gpt-5.1", 0.625, 5],
    ["gpt-5.1-2025-11-13", 0.625, 5],
    ["gpt-5", 0.625, 5],
    ["gpt-5-2025-08-07", 0.625, 5],
    ["gpt-5-mini", 0.125, 1],
    ["gpt-5-mini-2025-08-07", 0.125, 1],
    ["gpt-5-nano", 0.025, 0.2],
    ["gpt-5-nano-2025-08-07", 0.025, 0.2],
    ["o3", 1, 4],
    ["o3-2025-04-16", 1, 4],
    ["o4-mini", 0.55, 2.2],
    ["o4-mini-2025-04-16", 0.55, 2.2],
  ])(
    "should price %s Flex processing",
    (modelName, inputPerMillion, outputPerMillion) => {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === modelName,
      );
      const tier = model?.pricingTiers.find(
        (candidate) => candidate.name === "Flex",
      );

      expect(tier, modelName).toBeDefined();
      expect(tier?.conditions).toEqual([
        {
          source: "model_parameters",
          key: "service_tier",
          operator: "in",
          values: ["flex"],
        },
      ]);
      expect(tier?.prices.input).toBeCloseTo(inputPerMillion * 1e-6, 15);
      expect(tier?.prices.output).toBeCloseTo(outputPerMillion * 1e-6, 15);
    },
  );

  it.each(["claude-opus-5", "claude-opus-4-8"])(
    "should price %s Fast mode using Anthropic's speed parameter",
    (modelName) => {
      const model = defaultModelPrices.find(
        (candidate) => candidate.modelName === modelName,
      );
      const tier = model?.pricingTiers.find(
        (candidate) => candidate.name === "Fast mode",
      );

      expect(tier, modelName).toBeDefined();
      expect(tier?.conditions).toEqual([
        {
          source: "model_parameters",
          key: "speed",
          operator: "in",
          values: ["fast"],
        },
      ]);
      expect(tier?.prices.input).toBe(10e-6);
      expect(tier?.prices.output).toBe(50e-6);
      expect(tier?.prices.input_cache_creation_5m).toBe(12.5e-6);
      expect(tier?.prices.input_cache_creation_1h).toBe(20e-6);
      expect(tier?.prices.input_cache_read).toBe(1e-6);

      const tiers: PricingTierWithPrices[] = model!.pricingTiers.map(
        (candidate) => ({
          id: candidate.id,
          name: candidate.name,
          isDefault: candidate.isDefault,
          priority: candidate.priority,
          conditions: candidate.conditions,
          prices: Object.entries(candidate.prices).map(
            ([usageType, price]) => ({
              usageType,
              price: new Decimal(price),
            }),
          ),
        }),
      );
      expect(
        matchPricingTier(
          tiers,
          { input: 1000 },
          { modelParameters: { speed: "fast" } },
        )?.pricingTierName,
      ).toBe("Fast mode");
    },
  );
});

describe("validateRegexPattern", () => {
  it("should accept valid regex patterns", () => {
    expect(() => validateRegexPattern("^input")).not.toThrow();
    expect(() => validateRegexPattern("^(input|output)")).not.toThrow();
    expect(() => validateRegexPattern(".*tokens.*")).not.toThrow();
    expect(() => validateRegexPattern("^input_[a-z]+$")).not.toThrow();
  });

  it("should reject empty patterns", () => {
    expect(() => validateRegexPattern("")).toThrow("Pattern cannot be empty");
  });

  it("should reject patterns exceeding max length", () => {
    const longPattern = "a".repeat(201);
    expect(() => validateRegexPattern(longPattern)).toThrow(
      "Pattern exceeds maximum length of 200 characters",
    );
  });

  it("should reject invalid regex syntax", () => {
    expect(() => validateRegexPattern("(unclosed")).toThrow(
      "Invalid regex syntax",
    );
    expect(() => validateRegexPattern("[unclosed")).toThrow(
      "Invalid regex syntax",
    );
  });

  it("should reject patterns with catastrophic backtracking", () => {
    // Classic catastrophic backtracking pattern
    const dangerousPattern = "(a+)+b";
    expect(() => validateRegexPattern(dangerousPattern)).toThrow(
      "catastrophic backtracking",
    );
  });

  it("should accept safe complex patterns", () => {
    expect(() => validateRegexPattern("^(input|prompt)_tokens$")).not.toThrow();
    expect(() =>
      validateRegexPattern("^(input|output)_(cached|regular)$"),
    ).not.toThrow();
  });
});

describe("matchPricingTier", () => {
  describe("attribute conditions", () => {
    const tiers: PricingTierWithPrices[] = [
      {
        id: "tier-default",
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: [{ usageType: "input", price: new Decimal("0.000005") }],
      },
      {
        id: "tier-priority",
        name: "Priority",
        isDefault: false,
        priority: 1,
        conditions: [
          {
            source: "model_parameters",
            key: "service_tier",
            operator: "in",
            values: ["priority"],
          },
        ],
        prices: [{ usageType: "input", price: new Decimal("0.0000125") }],
      },
    ];

    it("matches exact top-level model parameters", () => {
      const result = matchPricingTier(
        tiers,
        { input: 12 },
        {
          modelParameters: { service_tier: "priority" },
        },
      );

      expect(result?.pricingTierId).toBe("tier-priority");
    });

    it("matches exact top-level metadata", () => {
      const metadataTiers: PricingTierWithPrices[] = [
        tiers[0]!,
        {
          ...tiers[1]!,
          conditions: [
            {
              source: "metadata",
              key: "inference_geo",
              operator: "in",
              values: ["us"],
            },
          ],
        },
      ];

      const result = matchPricingTier(
        metadataTiers,
        { input: 12 },
        {
          metadata: { inference_geo: "us" },
        },
      );

      expect(result?.pricingTierId).toBe("tier-priority");
    });

    it("falls back when the exact key is absent", () => {
      const result = matchPricingTier(
        tiers,
        { input: 12 },
        {
          modelParameters: { different_key: "priority" },
        },
      );

      expect(result?.pricingTierId).toBe("tier-default");
    });

    it.each(["fast", "priority"])(
      "matches any configured attribute value for %s",
      (serviceTier) => {
        const result = matchPricingTier(
          [
            tiers[0]!,
            {
              ...tiers[1]!,
              conditions: [
                {
                  source: "model_parameters",
                  key: "service_tier",
                  operator: "in",
                  values: ["fast", "priority"],
                },
              ],
            },
          ],
          { input: 12 },
          { modelParameters: { service_tier: serviceTier } },
        );

        expect(result?.pricingTierId).toBe("tier-priority");
      },
    );

    it("falls back when an attribute value is outside the configured set", () => {
      const result = matchPricingTier(
        [
          tiers[0]!,
          {
            ...tiers[1]!,
            conditions: [
              {
                source: "model_parameters",
                key: "service_tier",
                operator: "in",
                values: ["fast", "priority"],
              },
            ],
          },
        ],
        { input: 12 },
        { modelParameters: { service_tier: "standard" } },
      );

      expect(result?.pricingTierId).toBe("tier-default");
    });
  });

  describe("Basic tier matching", () => {
    it("should return default tier when no conditions match", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [
            { usageType: "input", price: new Decimal("0.000003") },
            { usageType: "output", price: new Decimal("0.000015") },
          ],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 500000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000001") }],
        },
      ];

      const usageDetails = {
        input: 100000,
        output: 2000,
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result).not.toBeNull();
      expect(result?.pricingTierId).toBe("tier-default");
      expect(result?.pricingTierName).toBe("Standard");
      expect(result?.prices.input.toNumber()).toBe(0.000003);
      expect(result?.prices.output.toNumber()).toBe(0.000015);
    });

    it("should return matched tier when condition passes", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      const usageDetails = {
        input: 250000,
        output: 2000,
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result).not.toBeNull();
      expect(result?.pricingTierId).toBe("tier-high");
      expect(result?.pricingTierName).toBe("High Volume");
      expect(result?.prices.input.toNumber()).toBe(0.000006);
    });

    it("should return null when no tiers exist", () => {
      const tiers: PricingTierWithPrices[] = [];
      const usageDetails = { input: 1000 };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result).toBeNull();
    });

    it("should return null when no default tier exists and no conditions match", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 500000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000001") }],
        },
      ];

      const usageDetails = { input: 100000 };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result).toBeNull();
    });
  });

  describe("Pattern matching", () => {
    it("should sum values from multiple keys matching pattern", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input", // Matches input, input_cached, input_regular
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      const usageDetails = {
        input_cached: 150000,
        input_regular: 60000, // Total: 210K > 200K
        output: 2000,
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-high");
      expect(result?.pricingTierName).toBe("High Volume");
    });

    it("should be case-insensitive by default", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^INPUT",
              operator: "gt",
              value: 100000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      const usageDetails = {
        input_tokens: 150000, // Should match "^INPUT" case-insensitively
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-high");
    });

    it("should respect case-sensitive flag", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^INPUT",
              operator: "gt",
              value: 100000,
              caseSensitive: true, // Case-sensitive matching
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      const usageDetails = {
        input_tokens: 150000, // Should NOT match "^INPUT" with case-sensitive
        INPUT_TOKENS: 50000, // Should match but below threshold
      };

      const result = matchPricingTier(tiers, usageDetails);

      // Should fall back to default since INPUT_TOKENS (50K) < 100K
      expect(result?.pricingTierId).toBe("tier-default");
    });
  });

  describe("Operator evaluation", () => {
    const createTiers = (
      operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq",
      value: number,
    ): PricingTierWithPrices[] => [
      {
        id: "tier-default",
        name: "Default",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: [{ usageType: "input", price: new Decimal("0.000003") }],
      },
      {
        id: "tier-conditional",
        name: "Conditional",
        isDefault: false,
        priority: 1,
        conditions: [
          {
            usageDetailPattern: "^input",
            operator,
            value,
            caseSensitive: false,
          },
        ],
        prices: [{ usageType: "input", price: new Decimal("0.000006") }],
      },
    ];

    it("should correctly evaluate 'gt' operator", () => {
      const tiers = createTiers("gt", 100);

      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-default",
      );
      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-default",
      );
    });

    it("should correctly evaluate 'gte' operator", () => {
      const tiers = createTiers("gte", 100);

      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-default",
      );
    });

    it("should correctly evaluate 'lt' operator", () => {
      const tiers = createTiers("lt", 100);

      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-default",
      );
      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-default",
      );
    });

    it("should correctly evaluate 'lte' operator", () => {
      const tiers = createTiers("lte", 100);

      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-default",
      );
    });

    it("should correctly evaluate 'eq' operator", () => {
      const tiers = createTiers("eq", 100);

      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-default",
      );
      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-default",
      );
    });

    it("should correctly evaluate 'neq' operator", () => {
      const tiers = createTiers("neq", 100);

      expect(matchPricingTier(tiers, { input: 99 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 101 })?.pricingTierId).toBe(
        "tier-conditional",
      );
      expect(matchPricingTier(tiers, { input: 100 })?.pricingTierId).toBe(
        "tier-default",
      );
    });
  });

  describe("Priority-based tier selection", () => {
    it("should select tier with lowest priority when multiple tiers match", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-medium",
          name: "Medium Volume",
          isDefault: false,
          priority: 2, // Higher priority number
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000002") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1, // Lower priority number (evaluated first)
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 100000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000001") }],
        },
      ];

      const usageDetails = { input: 250000 };

      const result = matchPricingTier(tiers, usageDetails);

      // Both tier-medium and tier-high match, but tier-high has priority 1 (evaluated first)
      expect(result?.pricingTierId).toBe("tier-high");
      expect(result?.pricingTierName).toBe("High Volume");
    });
  });

  describe("Multiple conditions (AND logic)", () => {
    it("should match only when ALL conditions pass", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-complex",
          name: "Complex Tier",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
            {
              usageDetailPattern: "^output",
              operator: "lt",
              value: 10000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      // Both conditions match: input > 200K AND output < 10K
      const usageDetails1 = {
        input: 250000,
        output: 5000,
      };
      expect(matchPricingTier(tiers, usageDetails1)?.pricingTierId).toBe(
        "tier-complex",
      );

      // First condition matches, second doesn't: input > 200K but output >= 10K
      const usageDetails2 = {
        input: 250000,
        output: 15000,
      };
      expect(matchPricingTier(tiers, usageDetails2)?.pricingTierId).toBe(
        "tier-default",
      );

      // Second condition matches, first doesn't: input <= 200K but output < 10K
      const usageDetails3 = {
        input: 100000,
        output: 5000,
      };
      expect(matchPricingTier(tiers, usageDetails3)?.pricingTierId).toBe(
        "tier-default",
      );
    });
  });

  describe("Pattern matching edge cases", () => {
    it("should handle missing keys in usage details", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      // No keys matching "^input" pattern
      const usageDetails = {
        output: 2000,
      };

      const result = matchPricingTier(tiers, usageDetails);

      // Should fall back to default (sum of matching keys is 0)
      expect(result?.pricingTierId).toBe("tier-default");
    });

    it("should handle pattern matching no keys (sum = 0)", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-special",
          name: "Special",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^special",
              operator: "eq",
              value: 0, // Matches when sum is exactly 0
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000001") }],
        },
      ];

      const usageDetails = {
        input: 1000,
        output: 500,
      };

      const result = matchPricingTier(tiers, usageDetails);

      // No keys match "^special", so sum = 0, which equals 0
      expect(result?.pricingTierId).toBe("tier-special");
    });

    it("should handle complex regex patterns", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-cache",
          name: "Cache Tier",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "_(cached|cache)$", // Matches keys ending with _cached or _cache
              operator: "gt",
              value: 50000,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000001") }],
        },
      ];

      const usageDetails = {
        input_cached: 30000,
        output_cache: 25000, // Total: 55K > 50K
        input_regular: 100000,
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-cache");
    });
  });

  describe("Edge cases and error handling", () => {
    it("should handle zero values in usage details", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-high",
          name: "High Volume",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "eq",
              value: 0,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0") }],
        },
      ];

      const usageDetails = {
        input: 0,
        output: 100,
      };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-high");
    });

    it("should handle empty usage details object", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
      ];

      const usageDetails = {};

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-default");
    });

    it("should gracefully handle invalid regex at runtime (should not happen due to validation)", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [{ usageType: "input", price: new Decimal("0.000003") }],
        },
        {
          id: "tier-invalid",
          name: "Invalid Regex Tier",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              // This would be caught by validation, but testing runtime safety
              usageDetailPattern: "(unclosed",
              operator: "gt",
              value: 100,
              caseSensitive: false,
            },
          ],
          prices: [{ usageType: "input", price: new Decimal("0.000006") }],
        },
      ];

      const usageDetails = { input: 1000 };

      // Should fall back to default due to regex error
      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.pricingTierId).toBe("tier-default");
    });
  });

  describe("Real-world examples", () => {
    it("should match Anthropic Claude tiered pricing", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-standard",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [
            { usageType: "input", price: new Decimal("0.000003") },
            { usageType: "output", price: new Decimal("0.000015") },
          ],
        },
        {
          id: "tier-large-context",
          name: "Large Context (>200K)",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^input",
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: [
            { usageType: "input", price: new Decimal("0.000006") },
            { usageType: "output", price: new Decimal("0.000015") },
          ],
        },
      ];

      // Below threshold
      const resultBelow = matchPricingTier(tiers, {
        input: 150000,
        output: 2000,
      });
      expect(resultBelow?.pricingTierName).toBe("Standard");
      expect(resultBelow?.prices.input.toNumber()).toBe(0.000003);

      // Above threshold
      const resultAbove = matchPricingTier(tiers, {
        input: 250000,
        output: 2000,
      });
      expect(resultAbove?.pricingTierName).toBe("Large Context (>200K)");
      expect(resultAbove?.prices.input.toNumber()).toBe(0.000006);
    });

    it("should match Google Gemini tiered pricing with multiple pattern options", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-standard",
          name: "Standard",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [
            { usageType: "input", price: new Decimal("0.00000125") },
            { usageType: "output", price: new Decimal("0.000005") },
          ],
        },
        {
          id: "tier-high-volume",
          name: "High Volume (>200K)",
          isDefault: false,
          priority: 1,
          conditions: [
            {
              usageDetailPattern: "^(input|prompt)", // Matches input or prompt prefixes
              operator: "gt",
              value: 200000,
              caseSensitive: false,
            },
          ],
          prices: [
            { usageType: "input", price: new Decimal("0.0000025") },
            { usageType: "output", price: new Decimal("0.00001") },
          ],
        },
      ];

      // Using "input" prefix
      const resultInput = matchPricingTier(tiers, {
        input_tokens: 250000,
        output_tokens: 5000,
      });
      expect(resultInput?.pricingTierName).toBe("High Volume (>200K)");

      // Using "prompt" prefix
      const resultPrompt = matchPricingTier(tiers, {
        prompt_tokens: 250000,
        completion_tokens: 5000,
      });
      expect(resultPrompt?.pricingTierName).toBe("High Volume (>200K)");
    });
  });

  describe("Decimal price handling", () => {
    it("should preserve Decimal precision in returned prices", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Default",
          isDefault: true,
          priority: 0,
          conditions: [],
          prices: [
            { usageType: "input", price: new Decimal("0.000003123456789") },
          ],
        },
      ];

      const usageDetails = { input: 1000 };

      const result = matchPricingTier(tiers, usageDetails);

      expect(result?.prices.input).toBeInstanceOf(Decimal);
      expect(result?.prices.input.toString()).toBe("0.000003123456789");
    });
  });
});
