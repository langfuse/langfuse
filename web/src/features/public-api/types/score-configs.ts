import {
  BooleanConfigFields,
  CategoricalConfigFields,
  TextConfigFields,
  jsonSchema,
  NumericConfigFields,
  paginationMetaResponseZod,
  publicApiPaginationZod,
  ScoreConfigCategory,
  ScoreConfigNameSchema,
  stringDateTime,
  validateCategories,
  validateNumericRangeFields,
} from "@langfuse/shared";
import { z } from "zod";

/**
 * Objects
 */
const CategoriesWithCustomError = jsonSchema.superRefine((categories, ctx) => {
  const parseResult = z.array(ScoreConfigCategory).safeParse(categories);
  if (!parseResult.success) {
    ctx.addIssue(
      "Category must be an array of objects with label value pairs, where labels and values are unique.",
    );
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
    z.object({
      ...ScoreConfigBase.shape,
      ...TextConfigFields.shape,
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
  name: ScoreConfigNameSchema,
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
    z.object({
      ...PostScoreConfigBase.shape,
      ...z.object({
        dataType: z.literal("TEXT"),
        categories: z.undefined(),
        maxValue: z.undefined().nullish(),
        minValue: z.undefined().nullish(),
      }).shape,
    }),
  ])
  .superRefine(validateNumericRangeFields);

export const PostScoreConfigResponse = APIScoreConfig;

// PUT /score-configs/{configId}
export const PutScoreConfigQuery = z.object({
  configId: z.string(),
});

const nonEmptyScoreConfigUpdateMessage =
  "Request body cannot be empty. At least one field must be provided for update.";

export const PutScoreConfigBody = z
  .object({
    isArchived: z.boolean().optional(),
    name: ScoreConfigNameSchema.optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    categories: CategoriesWithCustomError.optional(),
    description: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: nonEmptyScoreConfigUpdateMessage,
  });

export const PutScoreConfigBodyWithoutArchived = z
  .object({
    name: ScoreConfigNameSchema.optional(),
    minValue: z.number().optional(),
    maxValue: z.number().optional(),
    categories: CategoriesWithCustomError.optional(),
    description: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: nonEmptyScoreConfigUpdateMessage,
  });

export const PutScoreConfigResponse = APIScoreConfig;

// GET /score-configs
export const GetScoreConfigsQuery = z.object({
  // Optional ISO-8601 time window on the score config row's `createdAt`.
  // Both params are independently optional and compose into a half-open
  // `[fromTimestamp, toTimestamp)` range. Omitting both preserves the
  // historical "all configs" behavior. Pattern matches
  // `GET /api/public/comments` (PR #15692), `GET /api/public/models`
  // (PR #16952), `GET /api/public/datasets` (PR #17002),
  // `GET /api/public/llm-connections` (PR #17070), and
  // `GET /api/public/annotation-queues` (PR #17090).
  fromTimestamp: stringDateTime,
  toTimestamp: stringDateTime,
  ...publicApiPaginationZod,
});

export const GetScoreConfigsResponse = z.object({
  data: z.array(APIScoreConfig),
  meta: paginationMetaResponseZod,
});
