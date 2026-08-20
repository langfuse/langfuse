import { PricingTierCondition } from "../../features/model-pricing";
import type {
  PricingTierMatchAttributes,
  PricingTierMatchResult,
  PricingTierWithPrices,
} from "./types";

/**
 * Pricing tier matching algorithm
 * Evaluates conditions and selects the appropriate tier based on usage details
 */

/**
 * Evaluates a single condition against usage details or observation attributes.
 * Usage conditions sum keys matching the regex; attribute conditions compare an
 * exact top-level key against the configured values.
 */
function evaluateCondition(
  condition: PricingTierCondition,
  usageDetails: Record<string, number>,
  attributes: PricingTierMatchAttributes,
): boolean {
  try {
    if ("source" in condition) {
      const values =
        condition.source === "model_parameters"
          ? attributes.modelParameters
          : attributes.metadata;

      if (!Object.prototype.hasOwnProperty.call(values ?? {}, condition.key)) {
        return false;
      }

      const attributeValue = values?.[condition.key];
      return condition.values.includes(attributeValue ?? "");
    }

    // Build regex with case sensitivity flag
    const flags = condition.caseSensitive ? "" : "i";
    const regex = new RegExp(condition.usageDetailPattern, flags);

    // Find all keys matching the pattern
    const matchingKeys = Object.keys(usageDetails).filter((key) =>
      regex.test(key),
    );

    // Sum values of matching keys
    const sum = matchingKeys.reduce(
      (acc, key) => acc + (usageDetails[key] || 0),
      0,
    );

    // Compare sum to threshold
    switch (condition.operator) {
      case "gt":
        return sum > condition.value;
      case "gte":
        return sum >= condition.value;
      case "lt":
        return sum < condition.value;
      case "lte":
        return sum <= condition.value;
      case "eq":
        return sum === condition.value;
      case "neq":
        return sum !== condition.value;
      default:
        return false;
    }
  } catch {
    return false; // Fail-safe: condition fails on error
  }
}

/**
 * Evaluates all conditions for a tier (AND logic)
 * Returns true only if ALL conditions pass
 */
function evaluateConditions(
  conditions: PricingTierCondition[],
  usageDetails: Record<string, number>,
  attributes: PricingTierMatchAttributes,
): boolean {
  // Empty conditions should never match (except for default tiers)
  if (conditions.length === 0) {
    return false;
  }

  // All conditions must pass (AND logic)
  return conditions.every((condition) =>
    evaluateCondition(condition, usageDetails, attributes),
  );
}

export function hasPricingTierUsageDetails(
  usageDetails: Record<string, number> | undefined,
): boolean {
  return Object.keys(usageDetails ?? {}).length > 0;
}

/**
 * Matches usage details against pricing tiers and returns applicable tier with prices
 *
 * Algorithm:
 * 1. Filter out default tier and sort remaining tiers by priority (ascending)
 * 2. Evaluate each tier's conditions in priority order
 * 3. Return first tier where all conditions match
 * 4. If no match, fall back to default tier
 * 5. If no default tier exists, return null (should not happen after migration)
 *
 * @param tiers - Array of pricing tiers with prices
 * @param usageDetails - Usage details from the observation (e.g., { input_tokens: 250000, output_tokens: 2000 })
 * @param attributes - Top-level model parameters and metadata from the observation
 * @returns Matched tier with prices, or null if no match and no default
 */
export function matchPricingTier(
  tiers: PricingTierWithPrices[],
  usageDetails: Record<string, number>,
  attributes: PricingTierMatchAttributes = {},
): PricingTierMatchResult | null {
  // 1. Filter and sort non-default tiers by priority (ascending)
  const sortedTiers = tiers
    .filter((tier) => !tier.isDefault)
    .sort((a, b) => a.priority - b.priority);

  // 2. Try to match each tier in priority order
  for (const tier of sortedTiers) {
    if (evaluateConditions(tier.conditions, usageDetails, attributes)) {
      return {
        pricingTierId: tier.id,
        pricingTierName: tier.name,
        prices: Object.fromEntries(
          tier.prices.map((p) => [p.usageType, p.price]),
        ),
      };
    }
  }

  // 3. Fall back to default tier
  const defaultTier = tiers.find((tier) => tier.isDefault);

  if (defaultTier) {
    return {
      pricingTierId: defaultTier.id,
      pricingTierName: defaultTier.name,
      prices: Object.fromEntries(
        defaultTier.prices.map((p) => [p.usageType, p.price]),
      ),
    };
  }

  // 4. No match and no default (should not happen after migration)
  return null;
}
