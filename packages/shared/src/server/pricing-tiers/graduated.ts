import Decimal from "decimal.js";

import { toPriceRecord, type PricingTierWithPrices } from "./types";

/**
 * Graduated pricing tier structure for cost calculation.
 * Each tier defines a token range (from previous tier's upTo to this tier's upTo)
 * and the price per token within that range.
 */
type GraduatedTier = {
  upTo: number | null; // null = unlimited (last tier)
  prices: Record<string, Decimal>; // usageType -> price per unit
};

/**
 * Checks whether the given pricing tiers use graduated pricing.
 * Graduated pricing is indicated by at least one tier having an `upTo` value set.
 */
export function isGraduatedPricing(tiers: PricingTierWithPrices[]): boolean {
  return tiers.some((tier) => tier.upTo != null);
}

/**
 * Calculates costs using graduated pricing, where tokens are split across
 * tier boundaries and each portion is charged at the corresponding tier's rate.
 *
 * For example, with tiers:
 *   - Tier 0: upTo 200000, input price $0.000003
 *   - Tier 1: upTo null, input price $0.000006
 *
 * For 300K input tokens:
 *   - First 200K at $0.000003 = $0.60
 *   - Remaining 100K at $0.000006 = $0.60
 *   - Total input cost = $1.20
 *
 * @param tiers - Pricing tiers with upTo values and prices
 * @param usageUnits - Usage counts per type (e.g., { input: 300000, output: 5000 })
 * @returns Object with cost_details per usage type and total_cost
 */
export function calculateGraduatedCosts(
  tiers: PricingTierWithPrices[],
  usageUnits: Record<string, number>,
): { cost_details: Record<string, number>; total_cost: number | undefined } {
  // Sort tiers by priority ascending (lower priority = lower tier = first range)
  const sortedTiers = [...tiers].sort((a, b) => a.priority - b.priority);

  // Build graduated tier list with prices as Decimal maps
  const graduatedTiers: GraduatedTier[] = sortedTiers.map((tier) => ({
    upTo: tier.upTo,
    prices: toPriceRecord(tier.prices),
  }));

  const costDetails: Record<string, number> = {};

  for (const [usageType, units] of Object.entries(usageUnits)) {
    if (units == null || units <= 0) continue;

    let remainingUnits = units;
    let totalCost = new Decimal(0);
    let previousUpTo = 0;

    for (const tier of graduatedTiers) {
      if (remainingUnits <= 0) break;

      const tierCapacity =
        tier.upTo != null ? tier.upTo - previousUpTo : remainingUnits;

      if (tierCapacity <= 0) continue;

      const unitsInTier = Math.min(remainingUnits, tierCapacity);
      const price = tier.prices[usageType];

      if (price) {
        totalCost = totalCost.add(price.mul(unitsInTier));
      }

      remainingUnits -= unitsInTier;
      previousUpTo = tier.upTo ?? previousUpTo + unitsInTier;
    }

    costDetails[usageType] = totalCost.toNumber();
  }

  // Calculate total cost
  let totalCost: number | undefined;
  if (
    Object.prototype.hasOwnProperty.call(costDetails, "total") &&
    costDetails.total != null
  ) {
    totalCost = costDetails.total;
  } else if (Object.keys(costDetails).length > 0) {
    totalCost = Object.values(costDetails).reduce((acc, cost) => acc + cost, 0);
    costDetails.total = totalCost;
  }

  return { cost_details: costDetails, total_cost: totalCost };
}
