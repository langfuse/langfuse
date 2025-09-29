import { z } from "zod/v4";
import { isPresent } from "../utils/typeChecks";

// Category type, used for categorical and boolean configs
export const ScoreConfigCategory = z.object({
  label: z.string().min(1),
  value: z.number(),
});

// Numeric config fields
export const NumericConfigFields = z.object({
  maxValue: z.number().nullish(),
  minValue: z.number().nullish(),
  dataType: z.literal("NUMERIC"),
  categories: z.undefined().nullish(),
});

// Boolean config fields
export const BooleanConfigFields = z.object({
  dataType: z.literal("BOOLEAN"),
  maxValue: z.number().nullish(),
  minValue: z.number().nullish(),
  categories: z
    .array(ScoreConfigCategory)
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

// Category config fields and types
export const validateCategories = (
  categories: z.infer<typeof ScoreConfigCategory>[],
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

export const CategoricalConfigFields = z.object({
  maxValue: z.undefined().nullish(),
  minValue: z.undefined().nullish(),
  dataType: z.literal("CATEGORICAL"),
  categories: z.array(ScoreConfigCategory).superRefine(validateCategories),
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

export const validateNumericRangeFields = (
  data: Pick<ScoreConfigDomain, "maxValue" | "minValue" | "dataType">,
  ctx: z.RefinementCtx,
): void | Promise<void> => {
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
};

export const ScoreConfigSchema = z
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

export type ScoreConfigDomain = z.infer<typeof ScoreConfigSchema>;
export type ScoreConfigCategoryDomain = z.infer<typeof ScoreConfigCategory>;
