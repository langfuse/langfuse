import {
  type ModelUsageUnit as PrismaModelUsageUnit,
  paginationMetaResponseZod,
  type Model as PrismaModel,
  jsonSchema,
  publicApiPaginationZod,
} from "@langfuse/shared";
import { z } from "zod/v4";
import { type Decimal } from "decimal.js";
import {
  validatePricingTiers,
  PricingTierConditionSchema,
  PricingTierInputSchema,
  type PricingTierCondition,
} from "@langfuse/shared";

/**
 * Objects
 */

const APIModelUsageUnit = z.enum([
  "TOKENS",
  "CHARACTERS",
  "MILLISECONDS",
  "SECONDS",
  "REQUESTS",
  "IMAGES",
]);

/**
 * API Pricing Tier Definition (response)
 */
const APIPricingTier = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  priority: z.number().int(),
  conditions: z.array(PricingTierConditionSchema),
  prices: z.record(z.string(), z.number()),
});

const APIModelDefinition = z
  .object({
    id: z.string(),
    modelName: z.string(),
    matchPattern: z.string(),
    startDate: z.coerce.date().nullable(),
    inputPrice: z.number().nonnegative().nullable(),
    outputPrice: z.number().nonnegative().nullable(),
    totalPrice: z.number().nonnegative().nullable(),
    unit: APIModelUsageUnit.nullish(),
    tokenizerId: z.string().nullable(),
    tokenizerConfig: z.any(), // Assuming Prisma.JsonValue is any type
    isLangfuseManaged: z.boolean(),
    createdAt: z.coerce.date(),
    prices: z.record(z.string(), z.object({ price: z.number() })),
    pricingTiers: z.array(APIPricingTier),
  })
  .strict();

/**
 * Transforms
 */

export function prismaToApiModelDefinition({
  projectId,
  inputPrice,
  outputPrice,
  totalPrice,
  unit,

  updatedAt,
  pricingTiers,
  ...model
}: PrismaModel & {
  pricingTiers?: Array<{
    id: string;
    name: string;
    isDefault: boolean;
    priority: number;
    conditions: unknown; // JsonValue from Prisma
    prices: Array<{ usageType: string; price: Decimal }>;
  }>;
}): z.infer<typeof APIModelDefinition> {
  // Find default tier for backward compatibility fields
  const defaultTier = pricingTiers?.find((t) => t.isDefault);
  const defaultTierPrices = defaultTier?.prices;

  let flatPrices: Record<string, { price: number }> = {};

  if (defaultTierPrices) {
    // Build backward-compatible flat prices from default tier
    flatPrices = defaultTierPrices.reduce(
      (acc, p) => {
        acc[p.usageType] = { price: p.price.toNumber() };

        return acc;
      },
      {} as Record<string, { price: number }>,
    );
  }

  return {
    ...model,
    unit: unit as PrismaModelUsageUnit,
    inputPrice: flatPrices.input?.price ?? inputPrice?.toNumber() ?? null,
    outputPrice: flatPrices.output?.price ?? outputPrice?.toNumber() ?? null,
    totalPrice: flatPrices.total?.price ?? totalPrice?.toNumber() ?? null,
    prices: flatPrices,
    isLangfuseManaged: !Boolean(projectId),
    pricingTiers:
      pricingTiers?.map((tier) => ({
        id: tier.id,
        name: tier.name,
        isDefault: tier.isDefault,
        priority: tier.priority,
        conditions: tier.conditions as PricingTierCondition[],
        prices: tier.prices.reduce(
          (acc, p) => {
            acc[p.usageType] = p.price.toNumber();
            return acc;
          },
          {} as Record<string, number>,
        ),
      })) ?? [],
  };
}

/**
 * Endpoints
 */

// GET /models
export const GetModelsV1Query = z.object({
  ...publicApiPaginationZod,
});
export const GetModelsV1Response = z
  .object({
    data: z.array(APIModelDefinition),
    meta: paginationMetaResponseZod,
  })
  .strict();

// POST /models
export const PostModelsV1Body = z
  .object({
    modelName: z.string(),
    matchPattern: z.string(),
    startDate: z.coerce.date().nullish(),
    inputPrice: z.number().nonnegative().nullish(),
    outputPrice: z.number().nonnegative().nullish(),
    totalPrice: z.number().nonnegative().nullish(),
    unit: APIModelUsageUnit,
    tokenizerId: z.enum(["openai", "claude"]).nullish(),
    tokenizerConfig: jsonSchema.nullish(),
    pricingTiers: z.array(PricingTierInputSchema).nullish(),
  })
  .superRefine((data, ctx) => {
    const hasFlatPrices =
      data.inputPrice != null ||
      data.outputPrice != null ||
      data.totalPrice != null;
    const hasTiers = data.pricingTiers && data.pricingTiers.length > 0;

    // Validation 1: Must provide either flat prices OR pricing tiers (not both, not neither)
    if (hasFlatPrices && hasTiers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Must provide either flat prices (inputPrice/outputPrice/totalPrice) OR pricingTiers, not both",
      });
      return;
    }

    if (!hasFlatPrices && !hasTiers) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Must provide either flat prices (inputPrice/outputPrice/totalPrice) OR pricingTiers",
      });
      return;
    }

    // Validation 2: If using flat prices, validate totalPrice constraint
    if (hasFlatPrices) {
      if ((data.inputPrice || data.outputPrice) && data.totalPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["totalPrice"],
          message:
            "If input and/or output price is set, total price must be null",
        });
      }
    }

    // Validation 3: If using pricing tiers, validate them
    if (hasTiers) {
      const result = validatePricingTiers(data.pricingTiers!);
      if (!result.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pricingTiers"],
          message: result.error,
        });
      }
    }
  });
export const PostModelsV1Response = APIModelDefinition.strict();

// GET /models/{modelId}
export const GetModelV1Query = z.object({
  modelId: z.string(),
});
export const GetModelV1Response = APIModelDefinition.strict();

// DELETE /models/{modelId}
export const DeleteModelV1Query = z.object({
  modelId: z.string(),
});
export const DeleteModelV1Response = z
  .object({
    message: z.literal("Model successfully deleted"),
  })
  .strict();
