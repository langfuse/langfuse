import Decimal from "decimal.js";

import { type PricingTierInput } from "@langfuse/shared";

import {
  type FormPricingTier,
  type FormUpsertModel,
  type FormUsageType,
  type GetModelResult,
  parsePriceInput,
} from "@/src/features/models/validation";

/** What the dialog knows about the model being created, edited or cloned. */
export type ModelFormSource =
  | {
      action: "create";
      prefilledModelData?: {
        modelName?: string;
        prices?: Record<string, number>;
      };
    }
  | { action: "edit" | "clone"; modelData: GetModelResult };

const CREATE_DEFAULT_PRICES: Record<string, number> = {
  input: 0.000001,
  output: 0.000002,
};

export const matchPatternFor = (modelName: string) => `(?i)^(${modelName})$`;

/** Full decimal notation — `String(1e-7)` would put "1e-7" in the input. */
const formatPrice = (price: number) => new Decimal(price).toFixed();

/** Row keys are opaque and only need to be unique within one form instance. */
export const makeUsageTypeKeys = (
  existing: Pick<FormUsageType, "key">[],
  count: number,
): string[] => {
  const used = new Set(existing.map((row) => row.key));
  const keys: string[] = [];
  let candidate = existing.length;
  while (keys.length < count) {
    const key = `u${candidate++}`;
    if (!used.has(key)) keys.push(key);
  }
  return keys;
};

const toUsageTypeRows = (names: string[]): FormUsageType[] =>
  names.map((name, index) => ({ key: `u${index}`, name }));

const pricesByRowKey = (
  usageTypes: FormUsageType[],
  prices: Record<string, number>,
): FormPricingTier["prices"] =>
  Object.fromEntries(
    usageTypes.map((row) => {
      const price = prices[row.name];
      return [row.key, price === undefined ? "" : formatPrice(price)];
    }),
  );

export const buildFormValues = (source: ModelFormSource): FormUpsertModel => {
  if (source.action === "create") {
    const modelName = source.prefilledModelData?.modelName ?? "";
    // A generation whose usage details only carry `total` prefills {} — that
    // would open the dialog with no price rows at all.
    const prefilled = source.prefilledModelData?.prices;
    const prices =
      prefilled && Object.keys(prefilled).length > 0
        ? prefilled
        : CREATE_DEFAULT_PRICES;
    const usageTypes = toUsageTypeRows(Object.keys(prices));

    return {
      modelName,
      matchPattern: modelName ? matchPatternFor(modelName) : "",
      tokenizerId: null,
      tokenizerConfig: null,
      usageTypes,
      pricingTiers: [
        {
          name: "Standard",
          isDefault: true,
          conditions: [],
          prices: pricesByRowKey(usageTypes, prices),
        },
      ],
    };
  }

  const { modelData } = source;
  const tiers = [...modelData.pricingTiers].sort(
    (a, b) => Number(b.isDefault) - Number(a.isDefault),
  );
  // Union across tiers, default tier first: never silently drop a priced key.
  const usageTypes = toUsageTypeRows([
    ...new Set(tiers.flatMap((tier) => Object.keys(tier.prices))),
  ]);

  return {
    modelName: modelData.modelName,
    matchPattern: modelData.matchPattern,
    tokenizerId: modelData.tokenizerId,
    tokenizerConfig: JSON.stringify(modelData.tokenizerConfig ?? {}),
    usageTypes,
    pricingTiers: tiers.map((tier) => ({
      name: tier.name,
      isDefault: tier.isDefault,
      conditions: tier.conditions,
      prices: pricesByRowKey(usageTypes, tier.prices),
    })),
  };
};

/** Priority is derived from tier order, so it can never drift or collide. */
export const derivePriorities = (tiers: { isDefault: boolean }[]): number[] => {
  let next = 1;
  return tiers.map((tier) => (tier.isDefault ? 0 : next++));
};

export const toPricingTierInputs = (
  values: Pick<FormUpsertModel, "usageTypes" | "pricingTiers">,
): PricingTierInput[] => {
  const priorities = derivePriorities(values.pricingTiers);

  return values.pricingTiers.map((tier, tierIndex) => ({
    name: tier.name,
    isDefault: tier.isDefault,
    priority: priorities[tierIndex],
    conditions: tier.conditions.map((condition) => ({
      ...condition,
      caseSensitive: condition.caseSensitive ?? false,
    })),
    prices: Object.fromEntries(
      values.usageTypes.flatMap((row) => {
        const price = parsePriceInput(tier.prices[row.key]);
        return price === null ? [] : [[row.name.trim(), price] as const];
      }),
    ),
  }));
};
