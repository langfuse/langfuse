import {
  jsonSchema,
  paginationMetaResponseZod,
  paginationZod,
} from "@langfuse/shared";
import { z } from "zod";

const isPresent = <T>(value: T): value is NonNullable<T> =>
  value !== null && value !== undefined;

/**
 * Objects
 */
const Category = z.object({
  label: z.string().min(1),
  value: z.number(),
});

type ConfigCategory = z.infer<typeof Category>;

const Categories = z.array(Category);

const NumericScoreConfig = z.object({
  maxValue: z.number().optional().nullish(),
  minValue: z.number().optional().nullish(),
  dataType: z.literal("NUMERIC"),
  categories: z.undefined().nullish(),
});

const CategoricalScoreConfig = z.object({
  maxValue: z.undefined().nullish(),
  minValue: z.undefined().nullish(),
  dataType: z.literal("CATEGORICAL"),
  categories: jsonSchema.refine(
    (categories) => {
      if (!Array.isArray(categories)) {
        return false;
      }

      if (!Categories.safeParse(categories).success) {
        return false;
      }

      const uniqueNames = new Set<string>();
      const uniqueValues = new Set<number>();

      for (const category of categories as ConfigCategory[]) {
        if (uniqueNames.has(category.label)) {
          return false;
        }
        uniqueNames.add(category.label);

        if (uniqueValues.has(category.value)) {
          return false;
        }
        uniqueValues.add(category.value);
      }
      return true;
    },
    {
      message:
        "Category must be an array of objects with label value pairs, where labels and values are unique.",
    },
  ),
});

const BooleanScoreConfig = z.object({
  maxValue: z.undefined().nullish(),
  minValue: z.undefined().nullish(),
  dataType: z.literal("BOOLEAN"),
  categories: z
    .array(Category)
    .length(2, "Boolean data type must have exactly 2 categories.")
    .refine((categories) => {
      const expectedCategories = [
        { label: "True", value: 1 },
        { label: "False", value: 0 },
      ];
      return categories.every(
        (category, index) =>
          category.label === expectedCategories[index].label &&
          category.value === expectedCategories[index].value,
      );
    }),
});

const ScoreConfigBase = z.object({
  id: z.string(),
  name: z.string(),
  isArchived: z.boolean(),
  description: z.string().optional().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  projectId: z.string(),
});

const ScoreConfigPostBase = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const ScoreConfig = z
  .union([
    ScoreConfigBase.merge(NumericScoreConfig),
    ScoreConfigBase.merge(CategoricalScoreConfig),
    ScoreConfigBase.merge(BooleanScoreConfig),
  ])
  .superRefine((data, ctx) => {
    if (data.dataType === "NUMERIC") {
      if (
        isPresent(data.maxValue) &&
        isPresent(data.minValue) &&
        data.maxValue <= data.minValue
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum value must be greater than Minimum value",
        });
      }
    }
  });

/**
 * Endpoints
 */

// GET /score-configs/{configId}
export const GetScoreConfigBody = z.object({
  configId: z.string(),
});

export const GetScoreConfigResponse = ScoreConfig;

// POST /score-configs
export const ScoreConfigsPostSchema = z
  .union([
    ScoreConfigPostBase.merge(CategoricalScoreConfig),
    ScoreConfigPostBase.merge(NumericScoreConfig),
    ScoreConfigPostBase.merge(
      z.object({
        dataType: z.literal("BOOLEAN"),
        categories: z.undefined().nullish(),
      }),
    ),
  ])
  .superRefine((data, ctx) => {
    if (data.dataType === "NUMERIC") {
      if (
        isPresent(data.maxValue) &&
        isPresent(data.minValue) &&
        data.maxValue <= data.minValue
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Maximum value must be greater than Minimum value",
        });
      }
    }
  });

export const PostScoreConfigsResponse = ScoreConfig;

// GET /score-configs
export const ScoreConfigsGetSchema = z.object({
  ...paginationZod,
});

export const ScoreConfigsGetResponse = z.object({
  data: z.array(ScoreConfig),
  meta: paginationMetaResponseZod,
});
