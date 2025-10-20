import {
  NumericConfigFields,
  CategoricalConfigFields,
  BooleanConfigFields,
  validateNumericRangeFields,
} from "@langfuse/shared";
import { z } from "zod/v4";
import { type CreateConfig, type UpdateConfig } from "./upsertFormTypes";

const ScoreConfigBaseSchema = z.object({
  name: z.string().min(1).max(35),
  description: z.string().optional(),
});

// Validation-only schema without metadata fields (ids, timestamps etc.)
const ScoreConfigValidationSchema = ScoreConfigBaseSchema.and(
  z
    .discriminatedUnion("dataType", [
      NumericConfigFields,
      CategoricalConfigFields,
      BooleanConfigFields,
    ])
    .superRefine(validateNumericRangeFields),
);

export const validateScoreConfigUpsertFormInput = (
  values: CreateConfig | UpdateConfig,
): string | null => {
  const result = ScoreConfigValidationSchema.safeParse({
    ...values,
    categories: values.categories?.length ? values.categories : undefined,
  });

  return result.error
    ? result.error?.issues.map((issue) => issue.message).join(", ")
    : null;
};
