import { safeJsonParse } from "../../utils/json";
import type { ModelWithPrices } from "../ingestion/modelMatch";
import type { UsageCostType } from "../repositories/definitions";
import { hasPricingTierUsageDetails, matchPricingTier } from "./matcher";
import type { PricingTierMatchAttributes } from "./types";

// Custom models may only have aggregate cache-write pricing.
const TTL_CACHE_CREATION_USAGE_TYPES = new Set([
  "input_cache_creation_5m",
  "input_cache_creation_1h",
]);
const AGGREGATE_CACHE_CREATION_USAGE_TYPES = [
  "cache_creation_input_tokens",
  "input_cache_creation",
];

function toPricingAttributeRecord(value: unknown): Record<string, string> {
  const parsedValue = typeof value === "string" ? safeJsonParse(value) : value;
  if (
    !parsedValue ||
    typeof parsedValue !== "object" ||
    Array.isArray(parsedValue)
  ) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parsedValue).flatMap(([key, attributeValue]) =>
      typeof attributeValue === "string" ||
      typeof attributeValue === "number" ||
      typeof attributeValue === "boolean"
        ? [[key, String(attributeValue)]]
        : [],
    ),
  );
}

/** Price usage with a resolved model, retaining provided-cost precedence. */
export function calculateModelUsageCosts({
  model,
  usageDetails,
  providedCostDetails = {},
  attributes,
}: {
  model: ModelWithPrices;
  usageDetails: UsageCostType;
  providedCostDetails?: UsageCostType;
  attributes?: { modelParameters?: unknown; metadata?: unknown };
}): {
  cost_details: UsageCostType;
  total_cost: number | undefined;
  internal_model_id: string | undefined;
  usage_pricing_tier_id: string | null;
  usage_pricing_tier_name: string | null;
} {
  const { pricingTiers } = model;
  let matchedTier = null;
  // Empty usage must not select a tier against a fabricated all-zero vector.
  if (pricingTiers.length > 0 && hasPricingTierUsageDetails(usageDetails)) {
    const attributeSources = new Set(
      pricingTiers.flatMap((tier) =>
        tier.isDefault
          ? []
          : tier.conditions.flatMap((condition) =>
              "source" in condition ? [condition.source] : [],
            ),
      ),
    );
    const matchAttributes: PricingTierMatchAttributes | undefined =
      attributeSources.size > 0
        ? {
            modelParameters: attributeSources.has("model_parameters")
              ? toPricingAttributeRecord(attributes?.modelParameters)
              : {},
            metadata: attributeSources.has("metadata")
              ? toPricingAttributeRecord(attributes?.metadata)
              : {},
          }
        : undefined;
    matchedTier = matchPricingTier(pricingTiers, usageDetails, matchAttributes);
  }

  const providedCostKeys = Object.entries(providedCostDetails)
    .filter(([, value]) => value != null)
    .map(([key]) => key);
  let cost_details: UsageCostType;
  let total_cost: number | undefined;

  if (providedCostKeys.length > 0) {
    // A supplied cost disables catalog inference for all other cost buckets.
    cost_details = { ...providedCostDetails };
    total_cost =
      providedCostDetails.total ??
      (providedCostKeys.every((key) => ["input", "output"].includes(key))
        ? (providedCostDetails.input ?? 0) + (providedCostDetails.output ?? 0)
        : undefined);
  } else {
    const prices = new Map(Object.entries(matchedTier?.prices ?? {}));
    const costEntries: [string, number][] = [];
    for (const [usageType, units] of Object.entries(usageDetails)) {
      const price =
        prices.get(usageType) ??
        (TTL_CACHE_CREATION_USAGE_TYPES.has(usageType)
          ? AGGREGATE_CACHE_CREATION_USAGE_TYPES.map((key) =>
              prices.get(key),
            ).find((value) => value != null)
          : undefined);
      if (units != null && price != null) {
        costEntries.push([usageType, price.mul(units).toNumber()]);
      }
    }
    cost_details = Object.fromEntries(costEntries);
    total_cost =
      cost_details.total ??
      (costEntries.length > 0
        ? costEntries.reduce((sum, [, cost]) => sum + cost, 0)
        : undefined);
  }

  if (
    !Object.prototype.hasOwnProperty.call(cost_details, "total") &&
    total_cost != null
  ) {
    cost_details.total = total_cost;
  }

  return {
    cost_details,
    total_cost,
    internal_model_id: model.model?.id,
    usage_pricing_tier_id: matchedTier?.pricingTierId ?? null,
    usage_pricing_tier_name: matchedTier?.pricingTierName ?? null,
  };
}
