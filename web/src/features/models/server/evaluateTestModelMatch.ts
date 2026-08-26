import {
  hasPricingTierUsageDetails,
  matchPricingTier,
  type PricingTierWithPrices,
} from "@langfuse/shared/src/server";

export type TestModelMatchModel = {
  id: string;
  modelName: string;
  matchPattern: string;
  projectId: string | null;
};

export type TestModelMatchTier = {
  id: string;
  name: string;
  priority: number;
  isDefault: boolean;
  prices: Record<string, number>;
};

export type TestModelMatchResult =
  | { matched: false }
  | {
      matched: true;
      model: TestModelMatchModel;
      matchedTier: TestModelMatchTier | null;
    };

const toModelPayload = (model: TestModelMatchModel): TestModelMatchModel => ({
  id: model.id,
  modelName: model.modelName,
  matchPattern: model.matchPattern,
  projectId: model.projectId,
});

const toTierPayload = (tier: PricingTierWithPrices): TestModelMatchTier => ({
  id: tier.id,
  name: tier.name,
  priority: tier.priority,
  isDefault: tier.isDefault,
  prices: Object.fromEntries(
    tier.prices.map((price) => [price.usageType, price.price.toNumber()]),
  ),
});

/**
 * Pattern match is independent of usage. Pricing tiers (and therefore cost)
 * need usage details, matching ingestion. Returning matched:false when the
 * pattern hit but usage was empty made Test Model Match look broken.
 */
export function evaluateTestModelMatch(params: {
  model: TestModelMatchModel | null;
  pricingTiers: PricingTierWithPrices[];
  usageDetails?: Record<string, number>;
  modelParameters?: Record<string, string>;
  metadata?: Record<string, string>;
}): TestModelMatchResult {
  if (!params.model) {
    return { matched: false };
  }

  const model = toModelPayload(params.model);

  if (!hasPricingTierUsageDetails(params.usageDetails)) {
    return { matched: true, model, matchedTier: null };
  }

  const matchResult = matchPricingTier(
    params.pricingTiers,
    params.usageDetails ?? {},
    {
      modelParameters: params.modelParameters,
      metadata: params.metadata,
    },
  );

  if (!matchResult) {
    return { matched: true, model, matchedTier: null };
  }

  const matchedTier = params.pricingTiers.find(
    (tier) => tier.id === matchResult.pricingTierId,
  );

  return {
    matched: true,
    model,
    matchedTier: matchedTier ? toTierPayload(matchedTier) : null,
  };
}
