import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import { z } from "zod/v4";
import { validateRegexPattern } from "@langfuse/shared";
import {
  matchPricingTier,
  type PricingTierWithPrices,
} from "@langfuse/shared/src/server";
import { DefaultModelPriceSchema } from "../scripts/upsertDefaultModelPrices";
import defaultModelPrices from "../constants/default-model-prices.json";

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
          expect(condition).toHaveProperty("usageDetailPattern");
          expect(condition).toHaveProperty("operator");
          expect(condition).toHaveProperty("value");
          expect(condition).toHaveProperty("caseSensitive");

          // Validate operator
          expect(["gt", "gte", "lt", "lte", "eq", "neq"]).toContain(
            condition.operator,
          );

          // Validate value is a number
          expect(typeof condition.value).toBe("number");

          // Validate caseSensitive is boolean
          expect(typeof condition.caseSensitive).toBe("boolean");

          // Validate pattern is a string
          expect(typeof condition.usageDetailPattern).toBe("string");
          expect(condition.usageDetailPattern.length).toBeGreaterThan(0);
          expect(condition.usageDetailPattern.length).toBeLessThanOrEqual(200);
        }
      }
    }
  });

  it("should have valid regex patterns in all conditions", () => {
    for (const model of defaultModelPrices) {
      for (const tier of model.pricingTiers) {
        for (const condition of tier.conditions) {
          expect(() =>
            validateRegexPattern(condition.usageDetailPattern),
          ).not.toThrow();
        }
      }
    }
  });

  it("should correctly match claude-sonnet-4-5 model with tiered pricing", () => {
    const claudeModel = defaultModelPrices.find(
      (m) => m.id === "c5qmrqolku82tra3vgdixmys",
    );
    expect(claudeModel).toBeDefined();
    expect(claudeModel!.modelName).toBe("claude-sonnet-4-5-20250929");
    expect(claudeModel!.pricingTiers.length).toBe(2);

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

    // Test standard pricing (input <= 200K)
    const standardResult = matchPricingTier(tiers, {
      input: 150000,
      output: 5000,
    });
    expect(standardResult).not.toBeNull();
    expect(standardResult?.pricingTierName).toBe("Standard");
    expect(standardResult?.prices.input.toNumber()).toBe(0.000003);

    // Test large context pricing (input > 200K)
    const largeContextResult = matchPricingTier(tiers, {
      input: 250000,
      output: 5000,
    });
    expect(largeContextResult).not.toBeNull();
    expect(largeContextResult?.pricingTierName).toBe("Large Context");
    expect(largeContextResult?.prices.input.toNumber()).toBe(0.000006);
  });
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
