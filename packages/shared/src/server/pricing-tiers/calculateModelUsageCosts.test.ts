import { Decimal } from "decimal.js";
import { describe, expect, it, vi } from "vitest";
import { calculateModelUsageCosts } from "./calculateModelUsageCosts";
import type { ModelWithPrices } from "../ingestion/modelMatch";
import { logger } from "../logger";
import type { PricingTierWithPrices } from "./types";

function modelWithPrices(prices: Record<string, number>): ModelWithPrices {
  return {
    model: null,
    pricingTiers: [
      {
        id: "standard",
        name: "Standard",
        isDefault: true,
        priority: 0,
        conditions: [],
        prices: Object.entries(prices).map(([usageType, price]) => ({
          usageType,
          price: new Decimal(price),
        })),
      },
    ],
  };
}

describe("calculateModelUsageCosts", () => {
  it("infers costs when provided costs are null", () => {
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01, output: 0.02 }),
        usageDetails: { input: 100, output: 200 },
        providedCostDetails: null,
      }),
    ).toMatchObject({
      cost_details: { input: 1, output: 4, total: 5 },
      total_cost: 5,
    });
  });

  it("treats prototype property names as ordinary usage keys", () => {
    const usageDetails = Object.fromEntries([
      ["toString", 2],
      ["__proto__", 3],
    ]);
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01 }),
        usageDetails,
      }),
    ).toMatchObject({
      total_cost: undefined,
    });
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ toString: 0.01 }),
        usageDetails,
      }),
    ).toMatchObject({
      total_cost: 0.02,
    });
  });

  it.each<{
    providedCostDetails: Record<string, number>;
    total: number | undefined;
  }>([
    {
      providedCostDetails: { total: 0 },
      total: 0,
    },
    {
      providedCostDetails: { input: 2 },
      total: 2,
    },
    {
      providedCostDetails: { custom: 2 },
      total: undefined,
    },
  ])(
    "preserves provided costs: $providedCostDetails",
    ({ providedCostDetails, total }) => {
      const result = calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01, output: 0.02 }),
        usageDetails: { input: 100, output: 200, total: 300 },
        providedCostDetails,
      });
      expect(result.cost_details).toEqual({
        ...providedCostDetails,
        ...(total === undefined ? {} : { total }),
      });
      expect(result.total_cost).toBe(total);
    },
  );

  it("uses a priced total without adding components or requiring their prices", () => {
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01, total: 0.03 }),
        usageDetails: { input: 100, output: 200, total: 300 },
      }),
    ).toMatchObject({
      cost_details: { input: 1, total: 9 },
      total_cost: 9,
    });
  });

  it("keeps empty and total-only unpriced usage unknown, and preserves known zero", () => {
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01 }),
        usageDetails: {},
      }),
    ).toMatchObject({
      cost_details: {},
      total_cost: undefined,
      usage_pricing_tier_id: null,
    });
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0.01 }),
        usageDetails: { total: 300 },
      }),
    ).toMatchObject({
      total_cost: undefined,
    });
    expect(
      calculateModelUsageCosts({
        model: modelWithPrices({ input: 0 }),
        usageDetails: { input: 100, output: 0, total: 100 },
      }),
    ).toMatchObject({
      total_cost: 0,
    });
  });

  it("falls back to aggregate cache-write prices only when a TTL price is absent", () => {
    const result = calculateModelUsageCosts({
      model: modelWithPrices({
        cache_creation_input_tokens: 3.75e-6,
        input_cache_creation_1h: 6e-6,
      }),
      usageDetails: {
        input_cache_creation_5m: 2000,
        input_cache_creation_1h: 10256,
      },
    });
    expect(result.cost_details.input_cache_creation_5m).toBe(0.0075);
    expect(result.cost_details.input_cache_creation_1h).toBe(0.061536);
    expect(result.total_cost).toBeCloseTo(0.069036, 9);
  });

  it("matches context and parsed attributes before calculating costs", () => {
    const model = modelWithPrices({ input: 0.01, output: 0.02 });
    const tier: PricingTierWithPrices = {
      ...model.pricingTiers[0],
      id: "priority-long",
      name: "Priority long context",
      isDefault: false,
      priority: 1,
      conditions: [
        {
          source: "model_parameters",
          key: "service_tier",
          operator: "in",
          values: ["priority"],
        },
        {
          source: "metadata",
          key: "enabled",
          operator: "in",
          values: ["true"],
        },
        {
          usageDetailPattern: "^input",
          operator: "gt",
          value: 100,
          caseSensitive: false,
        },
      ],
      prices: [{ usageType: "input", price: new Decimal(0.04) }],
    };
    model.pricingTiers.push(tier);
    const result = calculateModelUsageCosts({
      model,
      usageDetails: { input: 150.5 },
      attributes: {
        modelParameters: '{"service_tier":"priority"}',
        metadata: { enabled: true },
      },
    });
    expect(result).toMatchObject({
      total_cost: 6.02,
      usage_pricing_tier_id: "priority-long",
    });
  });

  it("logs non-BMP usage keys once per call without changing pricing", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    try {
      const model = modelWithPrices({ input: 0.01 });
      const usageDetailPattern = "^(input|😀)$";
      const tier: PricingTierWithPrices = {
        ...model.pricingTiers[0],
        id: "unicode",
        name: "Unicode",
        isDefault: false,
        priority: 2,
        conditions: [
          {
            usageDetailPattern,
            operator: "eq",
            value: 150,
            caseSensitive: false,
          },
          {
            usageDetailPattern: "^input$",
            operator: "eq",
            value: 100,
            caseSensitive: true,
          },
        ],
        prices: [
          { usageType: "input", price: new Decimal(0.04) },
          { usageType: "😀", price: new Decimal(0.02) },
        ],
      };
      model.pricingTiers.push(
        {
          ...tier,
          id: "skipped",
          priority: 1,
          conditions: [
            ...tier.conditions,
            {
              usageDetailPattern,
              operator: "eq",
              value: 151,
              caseSensitive: false,
            },
          ],
        },
        tier,
      );
      const usageDetails = Object.freeze({
        input: 100,
        "😀": 50,
        "\u{10000}": 1,
        "\u{10ffff}": 1,
        entrée: 1,
        "\uffff": 1,
        "\ud800": 1,
        "\udfff": 1,
      });

      for (let attempt = 0; attempt < 2; attempt++) {
        expect(calculateModelUsageCosts({ model, usageDetails })).toMatchObject(
          {
            cost_details: { input: 4, "😀": 1, total: 5 },
            total_cost: 5,
            usage_pricing_tier_id: "unicode",
          },
        );
        expect(warn).toHaveBeenCalledTimes(attempt + 1);
        expect(warn).toHaveBeenLastCalledWith(
          "Pricing tier usage keys contain non-BMP characters",
          { usageDetailKeys: ["😀", "\u{10000}", "\u{10ffff}"] },
        );
      }
    } finally {
      warn.mockRestore();
    }
  });
});
