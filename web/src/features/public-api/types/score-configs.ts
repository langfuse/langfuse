import { isPresent } from "@/src/utils/typeChecks";
import {
  jsonSchema,
  paginationMetaResponseZod,
  paginationZod,
  type ScoreConfig as ScoreConfigDbType,
} from "@langfuse/shared";
import { z } from "zod";
import * as Sentry from "@sentry/node";

const validateCategories = (
  categories: ConfigCategory[],
  ctx: z.RefinementCtx,
) => {
  const uniqueNames = new Set<string>();
  const uniqueValues = new Set<number>();

  for (const category of categories) {
    if (uniqueNames.has(category.label)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate category label: ${category.label}, category labels must be unique`,
      });
      return;
    }
    uniqueNames.add(category.label);

    if (uniqueValues.has(category.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate category value: ${category.value}, category values must be unique`,
      });
      return;
    }
    uniqueValues.add(category.value);
  }
};

/**
 * Objects
 */
export const Category = z.object({
  label: z.string().min(1),
  value: z.number(),
});

export type ConfigCategory = z.infer<typeof Category>;

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
  categories: jsonSchema.superRefine((categories, ctx) => {
    const parseResult = Categories.safeParse(categories);
    if (!parseResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Category must be an array of objects with label value pairs, where labels and values are unique.",
      });
      return;
    }

    validateCategories(categories as ConfigCategory[], ctx);
  }),
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
  name: z.string().min(1).max(35),
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

const ValidatedScoreConfigSchema = z
  .union([
    ScoreConfigBase.merge(NumericScoreConfig),
    ScoreConfigBase.merge(
      z.object({
        maxValue: z.undefined().nullish(),
        minValue: z.undefined().nullish(),
        dataType: z.literal("CATEGORICAL"),
        categories: Categories.superRefine(validateCategories),
      }),
    ),
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

export type ValidatedScoreConfig = z.infer<typeof ValidatedScoreConfigSchema>;

export const filterAndValidateDbScoreConfigList = (
  scoreConfigs: ScoreConfigDbType[],
): ValidatedScoreConfig[] =>
  scoreConfigs.reduce((acc, ts) => {
    const result = ValidatedScoreConfigSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      Sentry.captureException(result.error);
    }
    return acc;
  }, [] as ValidatedScoreConfig[]);

export const validateDbScoreConfig = (
  scoreConfig: ScoreConfigDbType,
): ValidatedScoreConfig => ValidatedScoreConfigSchema.parse(scoreConfig);

export const validateDbScoreConfigSafe = (scoreConfig: ScoreConfigDbType) =>
  ValidatedScoreConfigSchema.safeParse(scoreConfig);

/**
 * Endpoints
 */

// GET /score-configs/{configId}
export const GetScoreConfigQuery = z.object({
  configId: z.string(),
});

export const GetScoreConfigResponse = ValidatedScoreConfigSchema;

// POST /score-configs
export const PostScoreConfigBody = z
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

export const PostScoreConfigResponse = ValidatedScoreConfigSchema;

// GET /score-configs
export const GetScoreConfigsQuery = z.object({
  ...paginationZod,
});

export const GetScoreConfigsResponse = z.object({
  data: z.array(ValidatedScoreConfigSchema),
  meta: paginationMetaResponseZod,
});
