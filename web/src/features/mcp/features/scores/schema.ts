import { ScoreConfigNameSchema } from "@langfuse/shared";
import { z } from "zod";

const McpScoreConfigNameSchema = ScoreConfigNameSchema.describe(
  "Allowed characters: letters, numbers, spaces, underscores, periods, parentheses, and hyphens.",
);

const McpScoreConfigNumericMinValueSchema = z
  .number()
  .optional()
  .describe("Minimum allowed value for NUMERIC score configs.");

const McpScoreConfigNumericMaxValueSchema = z
  .number()
  .optional()
  .describe("Maximum allowed value for NUMERIC score configs.");

const McpScoreConfigCategoricalCategoriesSchema = z
  .any()
  .optional()
  .describe(
    "Allowed categories for CATEGORICAL score configs as an array of { label, value } objects.",
  );

const normalizeMcpScoreConfigInput = <
  TInput extends {
    numericMinValue?: unknown;
    numericMaxValue?: unknown;
    categoricalCategories?: unknown;
  },
>(
  input: TInput,
) => {
  const {
    numericMinValue,
    numericMaxValue,
    categoricalCategories,
    ...scoreConfig
  } = input;

  return Object.fromEntries(
    Object.entries({
      ...scoreConfig,
      minValue: numericMinValue,
      maxValue: numericMaxValue,
      categories: categoricalCategories,
    }).filter(([, value]) => value !== undefined),
  );
};

const preprocessMcpScoreConfigInput = (input: unknown) => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return input;
  }

  return normalizeMcpScoreConfigInput(input);
};

export {
  McpScoreConfigCategoricalCategoriesSchema,
  McpScoreConfigNameSchema,
  McpScoreConfigNumericMaxValueSchema,
  McpScoreConfigNumericMinValueSchema,
  normalizeMcpScoreConfigInput,
  preprocessMcpScoreConfigInput,
};
