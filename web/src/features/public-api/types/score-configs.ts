import {
  BooleanConfigFields,
  CategoricalConfigFields,
  jsonSchema,
  NumericConfigFields,
  paginationMetaResponseZod,
  publicApiPaginationZod,
  ScoreConfigCategory,
  validateCategories,
  validateNumericRangeFields,
} from "@langfuse/shared";
import { z } from "zod/v4";

/**
 * Objects
 */
const CategoriesWithCustomError = jsonSchema.superRefine((categories, ctx) => {
  const parseResult = z.array(ScoreConfigCategory).safeParse(categories);
  if (!parseResult.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Category must be an array of objects with label value pairs, where labels and values are unique.",
    } as z.core.$ZodIssueCustom);
    return;
  }

  validateCategories(parseResult.data, ctx);
});

/**
 * Endpoints
 */
const ScoreConfigBase = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  isArchived: z.boolean(),
});

const APIScoreConfig = z
  .discriminatedUnion("dataType", [
    z.object({
      ...ScoreConfigBase.shape,
      ...NumericConfigFields.shape,
    }),
    z.object({
      ...ScoreConfigBase.shape,
      ...CategoricalConfigFields.shape,
    }),
    z.object({
      ...ScoreConfigBase.shape,
      ...BooleanConfigFields.shape,
    }),
  ])
  .superRefine(validateNumericRangeFields);

// GET /score-configs/{configId}
export const GetScoreConfigQuery = z.object({
  configId: z.string(),
});

export const GetScoreConfigResponse = APIScoreConfig;

// POST /score-configs
const PostScoreConfigBase = z.object({
  name: z.string(),
  description: z.string().nullish(),
});

export const PostScoreConfigBody = z
  .discriminatedUnion("dataType", [
    z.object({
      ...PostScoreConfigBase.shape,
      ...NumericConfigFields.shape,
    }),
    z.object({
      ...PostScoreConfigBase.shape,
      ...z.object({
        maxValue: z.undefined().nullish(),
        minValue: z.undefined().nullish(),
        dataType: z.literal("CATEGORICAL"),
        categories: CategoriesWithCustomError,
      }).shape,
    }),
    z.object({
      ...PostScoreConfigBase.shape,
      // Boolean config API POST body will always infer the categories based on data type
      ...z.object({
        dataType: z.literal("BOOLEAN"),
        categories: z.undefined(),
      }).shape,
    }),
  ])
  .superRefine(validateNumericRangeFields);

export const PostScoreConfigResponse = APIScoreConfig;

// PUT /score-configs/{configId}
export const PutScoreConfigQuery = z.object({
  configId: z.string(),
});

export const PutScoreConfigBody = z
  .object({
    isArchived: z.boolean().optional(),
    name: z.string().min(1).max(35).optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    categories: CategoriesWithCustomError.optional(),
    description: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message:
      "Request body cannot be empty. At least one field must be provided for update.",
  });

export const PutScoreConfigResponse = APIScoreConfig;

// GET /score-configs
export const GetScoreConfigsQuery = z.object({
  ...publicApiPaginationZod,
});

export const GetScoreConfigsResponse = z.object({
  data: z.array(APIScoreConfig),
  meta: paginationMetaResponseZod,
});
