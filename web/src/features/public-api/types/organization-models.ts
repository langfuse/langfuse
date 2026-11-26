import { z } from "zod";

import { type ModelDefinition } from "@/src/features/models/validation";
import {
  paginationMetaResponseZod,
  PricingTierConditionSchema,
  PricingTierInputSchema,
  publicApiPaginationZod,
  validatePricingTiers,
} from "@langfuse/shared";

const MAX_PRICING_TIERS = 50;
const MAX_USAGE_KEYS_PER_TIER = 100;

const OrganizationModelScope = z.enum(["ORGANIZATION", "LANGFUSE"]);

const APIOrganizationModel = z
  .object({
    id: z.string(),
    scope: OrganizationModelScope,
    modelName: z.string(),
    matchPattern: z.string(),
    pricingTiers: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          isDefault: z.boolean(),
          priority: z.number().int(),
          conditions: z.array(PricingTierConditionSchema),
          prices: z.record(z.string(), z.number()),
        })
        .strict(),
    ),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

/** Maps a definition visible to an organization to its public API shape. */
export function toApiOrganizationModel(model: ModelDefinition) {
  // Organization reads never return project rows (`organizationModelsSql`).
  const scope = OrganizationModelScope.parse(model.scope);
  return {
    id: model.id,
    scope,
    modelName: model.modelName,
    matchPattern: model.matchPattern,
    pricingTiers: model.pricingTiers,
    createdAt: model.createdAt,
    updatedAt: model.updatedAt,
  } satisfies z.input<typeof APIOrganizationModel>;
}

// GET /organizations/models
export const GetOrganizationModelsV1Query = z.object({
  ...publicApiPaginationZod,
  scope: z.enum(["ORGANIZATION", "LANGFUSE", "ALL"]).default("ORGANIZATION"),
  search: z.string().trim().max(255).optional(),
});
export const GetOrganizationModelsV1Response = z
  .object({
    data: z.array(APIOrganizationModel),
    meta: paginationMetaResponseZod,
  })
  .strict();

// GET /organizations/models/{id}, DELETE /organizations/models/{id}
export const OrganizationModelV1Query = z.object({
  id: z.string(),
});
export const GetOrganizationModelV1Response = APIOrganizationModel;

// PUT /organizations/models
export const PutOrganizationModelV1Body = z
  .object({
    // Not trimmed: the name addresses the stored row exactly, and settings UI
    // names may carry surrounding whitespace.
    modelName: z
      .string()
      .max(255)
      .refine((name) => name.trim().length > 0, "modelName must not be blank"),
    matchPattern: z.string().min(1).max(1000),
    pricingTiers: z
      .array(
        PricingTierInputSchema.extend({
          prices: PricingTierInputSchema.shape.prices.refine(
            (prices) => Object.keys(prices).length <= MAX_USAGE_KEYS_PER_TIER,
            `A pricing tier can price at most ${MAX_USAGE_KEYS_PER_TIER} usage keys`,
          ),
        }).strict(),
      )
      .max(MAX_PRICING_TIERS),
  })
  .strict()
  .superRefine(({ pricingTiers }, ctx) => {
    const result = validatePricingTiers(pricingTiers);
    if (!result.valid) {
      ctx.addIssue({
        code: "custom",
        path: ["pricingTiers"],
        message: result.error,
      });
    }
  });
export const PutOrganizationModelV1Response = APIOrganizationModel;

export const DeleteOrganizationModelV1Response = z
  .object({ message: z.string() })
  .strict();
