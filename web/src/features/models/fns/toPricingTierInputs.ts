import { type PricingTierInput } from "@langfuse/shared";

import { derivePriorities } from "@/src/features/models/fns/derivePriorities";
import { parsePriceInput } from "@/src/features/models/fns/parsePriceInput";
import { type FormUpsertModel } from "@/src/features/models/validation";

/** Form values -> the API's per-tier price maps, keyed by usage type name. */
export const toPricingTierInputs = (
  values: Pick<FormUpsertModel, "usageTypes" | "pricingTiers">,
): PricingTierInput[] => {
  const priorities = derivePriorities(values.pricingTiers);

  return values.pricingTiers.map((tier, tierIndex) => ({
    name: tier.name,
    isDefault: tier.isDefault,
    priority: priorities[tierIndex],
    conditions: tier.conditions.map((condition) =>
      "usageDetailPattern" in condition
        ? { ...condition, caseSensitive: condition.caseSensitive ?? false }
        : condition,
    ),
    prices: Object.fromEntries(
      values.usageTypes.flatMap((row) => {
        const price = parsePriceInput(tier.prices[row.key]);
        return price === null ? [] : [[row.name, price] as const];
      }),
    ),
  }));
};
