import { describe, expect, it } from "vitest";
import { Decimal } from "decimal.js";
import {
  matchPricingTier,
  validateRegexPattern,
  type PricingTierWithPrices,
} from "@langfuse/shared/src/server";

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
          name: "Standard Pricing",
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
      expect(result?.pricingTierName).toBe("Standard Pricing");
      expect(result?.prices.input.toNumber()).toBe(0.000003);
      expect(result?.prices.output.toNumber()).toBe(0.000015);
    });

    it("should return matched tier when condition passes", () => {
      const tiers: PricingTierWithPrices[] = [
        {
          id: "tier-default",
          name: "Standard Pricing",
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
          name: "Standard Pricing",
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
      expect(resultBelow?.pricingTierName).toBe("Standard Pricing");
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
          name: "Standard Pricing",
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
