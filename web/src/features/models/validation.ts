import { z } from "zod";

import { parsePriceInput } from "@/src/features/models/fns/parsePriceInput";
import {
  PricingTierConditionSchema,
  PricingTierInputSchema,
  validatePricingTiers,
} from "@langfuse/shared";

const USAGE_TYPE_PATTERN = /^[a-zA-Z0-9_-]+$/;
export const UsageTypeSchema = z.string().regex(USAGE_TYPE_PATTERN);
export const PriceSchema = z.number().nonnegative();
export const TokenizerSchema = z.enum(["openai", "claude"]).nullish();
// Input version: allows optional prices for form
const PriceMapInputSchema = z.record(UsageTypeSchema, PriceSchema.optional());

// Output version: filtered to only defined prices
export const PriceMapSchema = PriceMapInputSchema.transform((obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => Boolean(value)),
  ) as Record<string, number>;
}).pipe(z.record(UsageTypeSchema, PriceSchema));

export const PricingTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  priority: z.number(),
  conditions: z.array(PricingTierConditionSchema),
  prices: PriceMapSchema,
});

export type PricingTier = z.infer<typeof PricingTierSchema>;

/**
 * A usage type row is identified by its opaque `key`, never by its name: the
 * name is the value being edited, and deriving row identity from it is what
 * broke renames twice (LFE-8160, LFE-8629).
 */
const FormUsageTypeSchema = z.object({
  key: z.string(),
  name: z.string(),
});

export type FormUsageType = z.infer<typeof FormUsageTypeSchema>;

// Form-level tier schema. Prices are keyed by usage type row key and held as
// strings, so a half-typed "0." or "0.0000025" survives every keystroke.
export const FormPricingTierSchema = z.object({
  name: z.string().min(1, "Tier name is required"),
  isDefault: z.boolean(),
  conditions: z.array(PricingTierConditionSchema),
  prices: z.record(z.string(), z.string()),
});

// Use input type for form (allows optional/default fields)
export type FormPricingTier = z.input<typeof FormPricingTierSchema>;

export const GetModelResultSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  modelName: z.string(),
  matchPattern: z.string(),
  tokenizerConfig: z.union([
    z.record(z.string(), z.union([z.string(), z.coerce.number()])).nullable(),
    z.string(),
  ]),
  tokenizerId: TokenizerSchema,
  pricingTiers: z.array(PricingTierSchema),
});

export type GetModelResult = z.infer<typeof GetModelResultSchema>;

export const UpsertModelSchema = z
  .object({
    modelId: z.string().nullable(),
    projectId: z.string(),
    modelName: z.string().min(1),
    matchPattern: z.string().min(1),
    tokenizerId: z
      .enum(["openai", "claude", "None"])
      .nullish()
      .transform((value) => {
        return value === "None" ? null : value;
      })
      .pipe(TokenizerSchema.nullish()),
    tokenizerConfig: z
      .record(z.string(), z.union([z.string(), z.coerce.number()]))
      .optional(),
    pricingTiers: z.array(PricingTierInputSchema),
  })
  .refine(
    (data) => {
      const result = validatePricingTiers(data.pricingTiers);
      return result.valid;
    },
    {
      message: "Invalid pricing tiers configuration",
      path: ["pricingTiers"],
    },
  );
export type UpsertModel = z.infer<typeof UpsertModelSchema>;

export const FormUpsertModelSchema = z
  .object({
    modelName: z.string().min(1),
    matchPattern: z.string().min(1),
    tokenizerId: z.enum(["openai", "claude", "None"]).nullish(),
    tokenizerConfig: z
      .string()
      .refine(
        (value) => {
          try {
            JSON.parse(value);
            return true;
          } catch {
            return false;
          }
        },
        {
          message: "Tokenizer config needs to be valid JSON",
        },
      )
      .transform((value) => (value === "{}" ? undefined : value))
      .nullish(),
    // Usage types are model-level: the API requires every tier to price the
    // same set of keys, so the form models them once instead of per tier.
    usageTypes: z.array(FormUsageTypeSchema).min(1),
    pricingTiers: z.array(FormPricingTierSchema).min(1),
  })
  .superRefine(({ usageTypes, pricingTiers }, ctx) => {
    const seenUsageTypes = new Set<string>();
    usageTypes.forEach((row, index) => {
      const path = ["usageTypes", index, "name"];
      const name = row.name.trim();

      if (!name) {
        ctx.addIssue({ code: "custom", path, message: "Usage type required" });
      } else if (!USAGE_TYPE_PATTERN.test(name)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Only letters, numbers, hyphens and underscores",
        });
      } else if (seenUsageTypes.has(name)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Duplicate usage type "${name}"`,
        });
      }
      seenUsageTypes.add(name);
    });

    const seenTierNames = new Set<string>();
    pricingTiers.forEach((tier, tierIndex) => {
      // Compared trimmed, like usage types: whitespace must not sneak a second
      // tier past this check and render as an identical label.
      const tierName = tier.name.trim();
      const tierNamePath = ["pricingTiers", tierIndex, "name"];

      if (!tierName) {
        ctx.addIssue({
          code: "custom",
          path: tierNamePath,
          message: "Tier name is required",
        });
      } else if (seenTierNames.has(tierName)) {
        ctx.addIssue({
          code: "custom",
          path: tierNamePath,
          message: "Tier names must be unique",
        });
      }
      seenTierNames.add(tierName);

      if (!tier.isDefault && tier.conditions.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["pricingTiers", tierIndex, "conditions"],
          message: "Non-default tiers need at least one condition",
        });
      }

      usageTypes.forEach((row) => {
        if (parsePriceInput(tier.prices[row.key]) === null) {
          ctx.addIssue({
            code: "custom",
            path: ["pricingTiers", tierIndex, "prices", row.key],
            message: "Enter a price of 0 or more",
          });
        }
      });
    });
  });

// Use input type for form (allows optional/default fields from Zod schemas)
export type FormUpsertModel = z.input<typeof FormUpsertModelSchema>;

export enum PriceUnit {
  PerUnit = "per unit",
  Per1KUnits = "per 1K units",
  Per1MUnits = "per 1M units",
}

export const ModelLastUsedQueryResult = z.array(
  z.object({
    modelId: z.string(),
    lastUsed: z.coerce.date(),
  }),
);
