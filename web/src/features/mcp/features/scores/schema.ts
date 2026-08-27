import {
  SCORE_CONFIG_NAME_MAX_LENGTH,
  SCORE_CONFIG_NAME_MIN_LENGTH,
} from "@langfuse/shared";
import { z } from "zod";

// Deliberately not reusing ScoreConfigNameSchema: its Unicode-aware regex is
// not representable in MCP JSON Schema, character rules are
// still enforced at runtime via the strict input schemas.
const McpScoreConfigNameSchema = z
  .string()
  .min(SCORE_CONFIG_NAME_MIN_LENGTH)
  .max(SCORE_CONFIG_NAME_MAX_LENGTH)
  .describe(
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
