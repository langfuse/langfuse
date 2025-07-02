import { z } from "zod/v4";

import { ScoreConfig as ScoreConfigDbType } from "@prisma/client";

import { isPresent } from "../../utils/typeChecks";
import {
  jsonSchema,
  paginationMetaResponseZod,
  publicApiPaginationZod,
} from "../../utils/zod";

/**
 * Types to use across codebase
 */
export type ConfigCategory = z.infer<typeof Category>;
export type ValidatedScoreConfig = z.infer<typeof ValidatedScoreConfigSchema>;

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

const Categories = z.array(Category);

const NumericScoreConfig = z.object({
  maxValue: z.number().nullish(),
  minValue: z.number().nullish(),
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
        code: "custom",
        message:
          "Category must be an array of objects with label value pairs, where labels and values are unique.",
      } as z.core.$ZodIssueCustom);
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
  description: z.string().nullish(),
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

/**
 * Use this function when pulling a list of score configs from the database before using in the application to ensure type safety.
 * All score configs are expected to pass the validation. If a score fails validation, it will be logged to Otel.
 * @param scoreConfigs
 * @returns list of validated score configs
 */
export const filterAndValidateDbScoreConfigList = (
  scoreConfigs: ScoreConfigDbType[],
  onParseError?: (error: z.ZodError) => void, // eslint-disable-line no-unused-vars
): ValidatedScoreConfig[] =>
  scoreConfigs.reduce((acc, ts) => {
    const result = ValidatedScoreConfigSchema.safeParse(ts);
    if (result.success) {
      acc.push(result.data);
    } else {
      onParseError?.(result.error);
    }
    return acc;
  }, [] as ValidatedScoreConfig[]);

/**
 * Use this function when pulling a single score config from the database before using in the application to ensure type safety.
 * The score is expected to pass the validation. If a score fails validation, an error will be thrown.
 * @param scoreConfig
 * @returns validated score config
 * @throws error if score fails validation
 */
export const validateDbScoreConfig = (
  scoreConfig: ScoreConfigDbType,
): ValidatedScoreConfig => ValidatedScoreConfigSchema.parse(scoreConfig);

/**
 * Use this function when pulling a single score config from the database before using in the application to ensure type safety.
 * This function will NOT throw an error by default. The score is expected to pass the validation.
 * @param scoreConfig
 * @returns score config validation object:
 * - success: true if the score config passes validation
 * - data: the validated score config if success is true
 * - error: the error object if success is false
 */
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
  .discriminatedUnion("dataType", [
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
  ...publicApiPaginationZod,
});

export const GetScoreConfigsResponse = z.object({
  data: z.array(ValidatedScoreConfigSchema),
  meta: paginationMetaResponseZod,
});
