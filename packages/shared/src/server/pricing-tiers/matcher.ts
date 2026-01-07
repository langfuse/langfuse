import { PricingTierCondition } from "../../features/model-pricing";
import type { PricingTierMatchResult, PricingTierWithPrices } from "./types";

/**
 * Pricing tier matching algorithm
 * Evaluates conditions and selects the appropriate tier based on usage details
 */

/**
 * Evaluates a single condition against usage details
 * Sums all usage_details keys matching the pattern and compares to threshold
 */
function evaluateCondition(
  condition: PricingTierCondition,
  usageDetails: Record<string, number>,
): boolean {
  try {
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
): boolean {
  // Empty conditions should never match (except for default tiers)
  if (conditions.length === 0) {
    return false;
  }

  // All conditions must pass (AND logic)
  return conditions.every((condition) =>
    evaluateCondition(condition, usageDetails),
  );
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
 * @returns Matched tier with prices, or null if no match and no default
 */
export function matchPricingTier(
  tiers: PricingTierWithPrices[],
  usageDetails: Record<string, number>,
): PricingTierMatchResult | null {
  // 1. Filter and sort non-default tiers by priority (ascending)
  const sortedTiers = tiers
    .filter((tier) => !tier.isDefault)
    .sort((a, b) => a.priority - b.priority);

  // 2. Try to match each tier in priority order
  for (const tier of sortedTiers) {
    if (evaluateConditions(tier.conditions, usageDetails)) {
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
