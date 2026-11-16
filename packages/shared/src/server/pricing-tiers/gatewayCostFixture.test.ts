import { join } from "node:path";
import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateModelUsageCosts } from "./calculateModelUsageCosts";
import type { PricingTierWithPrices } from "./types";

/**
 * The AI gateway prices requests with a Rust port of calculateModelUsageCosts
 * and replays these cases. Regenerate with `vitest -u`.
 */
const FIXTURE_PATH = join(
  __dirname,
  "../../../../../ai-gateway/tests/fixtures/cost-cases.json",
);

type FixtureCondition =
  | {
      usage_detail_pattern: string;
      operator: "gt" | "gte" | "lt" | "lte" | "eq" | "neq";
      value: number;
      case_sensitive: boolean;
    }
  | {
      source: "model_parameters" | "metadata";
      key: string;
      values: string[];
    };

type FixtureTier = {
  id: string;
  name: string;
  is_default: boolean;
  priority: number;
  conditions: FixtureCondition[];
  prices: Record<string, number>;
};

type FixtureCase = {
  name: string;
  usage_details: Record<string, number>;
  provided_cost_details: Record<string, number> | null;
  model_parameters: unknown;
  metadata: unknown;
  tiers: FixtureTier[];
};

const standard = (prices: Record<string, number>): FixtureTier => ({
  id: "standard",
  name: "Standard",
  is_default: true,
  priority: 0,
  conditions: [],
  prices,
});

const longContext = (conditions: FixtureCondition[]): FixtureTier => ({
  id: "long-context",
  name: "Long context",
  is_default: false,
  priority: 1,
  conditions,
  prices: { input: 0.04, output: 0.08 },
});

const inputAbove = (value: number): FixtureCondition => ({
  usage_detail_pattern: "^input",
  operator: "gt",
  value,
  case_sensitive: false,
});

const base = {
  provided_cost_details: null,
  model_parameters: null,
  metadata: null,
};

const CASES: FixtureCase[] = [
  {
    ...base,
    name: "infers input and output costs from the default tier",
    usage_details: { input: 100, output: 200, total: 300 },
    tiers: [standard({ input: 0.01, output: 0.02 })],
  },
  {
    ...base,
    name: "provided total cost of zero wins over inferred costs",
    usage_details: { input: 100, output: 200, total: 300 },
    provided_cost_details: { total: 0 },
    tiers: [standard({ input: 0.01, output: 0.02 })],
  },
  {
    ...base,
    name: "provided input and output costs sum to the total",
    usage_details: { input: 100, output: 200, total: 300 },
    provided_cost_details: { input: 2, output: 0.5 },
    tiers: [standard({ input: 0.01, output: 0.02 })],
  },
  {
    ...base,
    name: "provided custom cost leaves the total unknown",
    usage_details: { input: 100, output: 200, total: 300 },
    provided_cost_details: { custom: 2 },
    tiers: [standard({ input: 0.01, output: 0.02 })],
  },
  {
    ...base,
    name: "priced total is used without adding components",
    usage_details: { input: 100, output: 200, total: 300 },
    tiers: [standard({ input: 0.01, total: 0.03 })],
  },
  {
    ...base,
    name: "empty usage selects no tier",
    usage_details: {},
    tiers: [standard({ input: 0.01 })],
  },
  {
    ...base,
    name: "unpriced total-only usage stays unknown",
    usage_details: { total: 300 },
    tiers: [standard({ input: 0.01 })],
  },
  {
    ...base,
    name: "zero price yields a known zero cost",
    usage_details: { input: 100, output: 0, total: 100 },
    tiers: [standard({ input: 0 })],
  },
  {
    ...base,
    name: "TTL cache writes fall back to the aggregate cache-write price",
    usage_details: {
      input_cache_creation_5m: 2000,
      input_cache_creation_1h: 10256,
    },
    tiers: [
      standard({
        cache_creation_input_tokens: 3.75e-6,
        input_cache_creation_1h: 6e-6,
      }),
    ],
  },
  {
    ...base,
    name: "usage condition above the threshold selects the long-context tier",
    usage_details: { input: 150, input_cached_tokens: 60, output: 10 },
    tiers: [
      standard({ input: 0.01, output: 0.02 }),
      longContext([inputAbove(200)]),
    ],
  },
  {
    ...base,
    name: "usage condition at the threshold falls back to the default tier",
    usage_details: { input: 150, input_cached_tokens: 50, output: 10 },
    tiers: [
      standard({ input: 0.01, output: 0.02 }),
      longContext([inputAbove(200)]),
    ],
  },
  {
    ...base,
    name: "case-sensitive usage pattern ignores differently cased keys",
    usage_details: { INPUT: 300, output: 10 },
    tiers: [
      standard({ INPUT: 0.01, output: 0.02 }),
      longContext([{ ...inputAbove(200), case_sensitive: true }]),
    ],
  },
  {
    ...base,
    name: "case-insensitive usage pattern matches differently cased keys",
    usage_details: { INPUT: 300, output: 10 },
    tiers: [
      standard({ INPUT: 0.01, output: 0.02 }),
      longContext([inputAbove(200)]),
    ],
  },
  {
    ...base,
    name: "invalid usage pattern fails the condition",
    usage_details: { input: 300 },
    tiers: [
      standard({ input: 0.01 }),
      longContext([{ ...inputAbove(0), usage_detail_pattern: "(" }]),
    ],
  },
  {
    ...base,
    name: "remaining operators compare the summed usage",
    usage_details: { input: 100, output: 50 },
    tiers: [
      standard({ input: 0.01 }),
      longContext([
        {
          usage_detail_pattern: ".*",
          operator: "gte",
          value: 150,
          case_sensitive: false,
        },
        {
          usage_detail_pattern: "^output$",
          operator: "lte",
          value: 50,
          case_sensitive: false,
        },
        {
          usage_detail_pattern: "^output$",
          operator: "lt",
          value: 51,
          case_sensitive: false,
        },
        {
          usage_detail_pattern: "^input$",
          operator: "neq",
          value: 99,
          case_sensitive: false,
        },
        {
          usage_detail_pattern: "^input$",
          operator: "eq",
          value: 100,
          case_sensitive: false,
        },
      ]),
    ],
  },
  {
    ...base,
    name: "lowest priority wins among matching tiers",
    usage_details: { input: 300 },
    tiers: [
      {
        ...longContext([inputAbove(100)]),
        id: "later",
        name: "Later",
        priority: 5,
      },
      standard({ input: 0.01 }),
      {
        ...longContext([inputAbove(100)]),
        id: "first",
        name: "First",
        priority: 2,
      },
    ],
  },
  {
    ...base,
    name: "no default tier and no match prices nothing",
    usage_details: { input: 300 },
    tiers: [longContext([inputAbove(1000)])],
  },
  {
    ...base,
    name: "attribute conditions match stringified parameters and metadata",
    usage_details: { input: 150.5 },
    model_parameters: { service_tier: "priority", temperature: 1 },
    metadata: { enabled: true, nested: { a: 1 } },
    tiers: [
      standard({ input: 0.01 }),
      longContext([
        {
          source: "model_parameters",
          key: "service_tier",
          values: ["priority"],
        },
        { source: "model_parameters", key: "temperature", values: ["1"] },
        { source: "metadata", key: "enabled", values: ["true"] },
        inputAbove(100),
      ]),
    ],
  },
  {
    ...base,
    name: "attribute values stored as JSON strings are parsed",
    usage_details: { input: 10 },
    model_parameters: '{"service_tier":"priority"}',
    tiers: [
      standard({ input: 0.01 }),
      longContext([
        {
          source: "model_parameters",
          key: "service_tier",
          values: ["priority"],
        },
      ]),
    ],
  },
  {
    ...base,
    name: "missing and nested attributes fail the condition",
    usage_details: { input: 10 },
    metadata: { nested: { a: 1 } },
    tiers: [
      standard({ input: 0.01 }),
      longContext([{ source: "metadata", key: "nested", values: [""] }]),
      {
        ...longContext([{ source: "metadata", key: "absent", values: [""] }]),
        id: "absent",
        name: "Absent",
        priority: 2,
      },
    ],
  },
  {
    ...base,
    name: "non-BMP keys are excluded from tier conditions but still priced",
    usage_details: { input: 100, "😀": 50, "\u{10000}": 1, entrée: 1 },
    tiers: [
      standard({ input: 0.01, "😀": 0.01 }),
      {
        ...longContext([
          {
            usage_detail_pattern: "^😀$",
            operator: "eq",
            value: 50,
            case_sensitive: true,
          },
        ]),
        id: "non-bmp",
        name: "Non-BMP usage",
      },
      {
        ...longContext([
          {
            usage_detail_pattern: ".*",
            operator: "eq",
            value: 101,
            case_sensitive: false,
          },
        ]),
        id: "bmp",
        name: "BMP usage",
        priority: 2,
        prices: { input: 0.04, "😀": 0.02 },
      },
    ],
  },
];

function toPricingTier(tier: FixtureTier): PricingTierWithPrices {
  return {
    id: tier.id,
    name: tier.name,
    isDefault: tier.is_default,
    priority: tier.priority,
    conditions: tier.conditions.map((condition) =>
      "source" in condition
        ? {
            source: condition.source,
            key: condition.key,
            operator: "in" as const,
            values: condition.values,
          }
        : {
            usageDetailPattern: condition.usage_detail_pattern,
            operator: condition.operator,
            value: condition.value,
            caseSensitive: condition.case_sensitive,
          },
    ),
    prices: Object.entries(tier.prices).map(([usageType, price]) => ({
      usageType,
      price: new Decimal(price),
    })),
  };
}

function buildFixture() {
  return {
    cases: CASES.map((fixtureCase) => {
      const result = calculateModelUsageCosts({
        model: {
          model: null,
          pricingTiers: fixtureCase.tiers.map(toPricingTier),
        },
        usageDetails: fixtureCase.usage_details,
        providedCostDetails: fixtureCase.provided_cost_details,
        attributes: {
          modelParameters: fixtureCase.model_parameters,
          metadata: fixtureCase.metadata,
        },
      });
      return {
        ...fixtureCase,
        expected: {
          cost_details: result.cost_details,
          total_cost: result.total_cost ?? null,
          usage_pricing_tier_id: result.usage_pricing_tier_id,
          usage_pricing_tier_name: result.usage_pricing_tier_name,
        },
      };
    }),
  };
}

describe("AI gateway cost fixture", () => {
  it("matches calculateModelUsageCosts", async () => {
    const fixture = `${JSON.stringify(buildFixture(), null, 2)}\n`;
    await expect(fixture).toMatchFileSnapshot(FIXTURE_PATH);
  });
});
