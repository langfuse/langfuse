import { Decimal } from "decimal.js";

const { mockMatchPricingTier } = vi.hoisted(() => ({
  mockMatchPricingTier: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  hasPricingTierUsageDetails: (usage?: Record<string, number>) =>
    Object.keys(usage ?? {}).length > 0,
  matchPricingTier: mockMatchPricingTier,
  redis: null,
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

import { evaluateTestModelMatch } from "@/src/features/models/server/evaluateTestModelMatch";

const model = {
  id: "model-1",
  modelName: "ltx2",
  matchPattern: "(?i)^(ltx2)$",
  projectId: "project-1",
};

const defaultTier = {
  id: "tier-default",
  name: "Standard",
  isDefault: true,
  priority: 0,
  conditions: [],
  prices: [{ usageType: "seconds", price: new Decimal("0.01") }],
};

describe("evaluateTestModelMatch", () => {
  beforeEach(() => {
    mockMatchPricingTier.mockReset();
  });

  it("returns unmatched only when no model pattern matched", () => {
    expect(
      evaluateTestModelMatch({
        model: null,
        pricingTiers: [defaultTier],
        usageDetails: { seconds: 1 },
      }),
    ).toEqual({ matched: false });
  });

  it("returns a model match without a tier when usage details are empty", () => {
    expect(
      evaluateTestModelMatch({
        model,
        pricingTiers: [defaultTier],
        usageDetails: {},
      }),
    ).toEqual({
      matched: true,
      model,
      matchedTier: null,
    });
    expect(mockMatchPricingTier).not.toHaveBeenCalled();
  });

  it("returns the matched pricing tier when usage details are present", () => {
    mockMatchPricingTier.mockReturnValue({
      pricingTierId: "tier-default",
      pricingTierName: "Standard",
      prices: { seconds: new Decimal("0.01") },
    });

    expect(
      evaluateTestModelMatch({
        model,
        pricingTiers: [defaultTier],
        usageDetails: { seconds: 20.424 },
      }),
    ).toEqual({
      matched: true,
      model,
      matchedTier: {
        id: "tier-default",
        name: "Standard",
        priority: 0,
        isDefault: true,
        prices: { seconds: 0.01 },
      },
    });
  });
});
