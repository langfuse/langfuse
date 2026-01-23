import { z } from "zod/v4";
import {
  PricingTierConditionSchema,
  PricingTierInputSchema,
  validatePricingTiers,
} from "@langfuse/shared";

export const UsageTypeSchema = z.string().regex(/^[a-zA-Z0-9_-]+$/);
export const PriceSchema = z.number().nonnegative();
export const TokenizerSchema = z.enum(["openai", "claude"]).nullish();
// Input version: allows optional prices for form
export const PriceMapInputSchema = z.record(
  UsageTypeSchema,
  PriceSchema.optional(),
);

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

// Form-level tier schema (includes optional id for edit mode)
export const FormPricingTierSchema = z.object({
  id: z.string().optional(), // For existing tiers in edit mode
  name: z.string().min(1, "Tier name is required"),
  isDefault: z.boolean(),
  priority: z.number().int(),
  conditions: z.array(PricingTierConditionSchema),
  prices: PriceMapInputSchema, // Use input schema for form
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

export const FormUpsertModelSchema = z.object({
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
  pricingTiers: z.array(FormPricingTierSchema),
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
