/**
 * Prompts Feature Validation Schemas
 *
 * Zod v4 schemas specific to the prompts feature domain.
 * Common cross-feature validations live in /core/validation.ts
 */

import { z } from "zod";
import {
  PROMPT_NAME_MAX_LENGTH,
  PROMPT_LABEL_MAX_LENGTH,
  PROMPT_LABEL_REGEX,
  PROMPT_LABEL_REGEX_ERROR,
  COMMIT_MESSAGE_MAX_LENGTH,
  LATEST_PROMPT_LABEL,
  PRODUCTION_LABEL,
  PromptLabelSchema,
} from "@langfuse/shared";

/**
 * Prompt name parameter
 * Must match existing Langfuse prompt name validation
 */
export const ParamPromptName = z
  .string()
  .min(1)
  .max(PROMPT_NAME_MAX_LENGTH)
  .describe("The name of the prompt");

/**
 * Prompt label parameter (optional)
 * Defaults to "latest" if not specified
 */
export const ParamPromptLabel = z
  .string()
  .min(1)
  .max(PROMPT_LABEL_MAX_LENGTH)
  .regex(PROMPT_LABEL_REGEX, PROMPT_LABEL_REGEX_ERROR)
  .optional()
  .describe(
    'Label to retrieve (e.g., "production", "staging"). Defaults to "latest".',
  );

/**
 * Prompt version parameter (optional)
 * Must be a positive integer
 */
export const ParamPromptVersion = z.coerce
  .number()
  .int()
  .positive()
  .optional()
  .describe("Specific version number to retrieve (e.g., 1, 2, 3)");

/**
 * Prompt tag parameter (optional)
 * Used for filtering prompts by tag
 */
export const ParamPromptTag = z
  .string()
  .optional()
  .describe("Tag to filter prompts (e.g., 'v1', 'experimental')");

/**
 * Commit message parameter (optional)
 * Used when creating new prompt versions
 */
export const ParamCommitMessage = z
  .string()
  .max(COMMIT_MESSAGE_MAX_LENGTH)
  .optional()
  .describe("Optional commit message describing the changes");

/**
 * Labels allowed while creating a new prompt version.
 */
export const ParamCreatePromptLabels = z
  .array(PromptLabelSchema)
  .refine((labels) => !labels.includes(PRODUCTION_LABEL), {
    message:
      "The 'production' label cannot be assigned when creating prompts through MCP. Create the prompt first, then use updatePromptLabels only when the user explicitly requests promotion to production.",
  })
  .optional()
  .describe(
    "Optional labels to assign. The 'production' label cannot be assigned during creation and the 'latest' label is auto-managed.",
  );

/**
 * New labels array for updating prompt labels
 */
export const ParamNewLabels = z
  .array(
    z
      .string()
      .min(1)
      .max(PROMPT_LABEL_MAX_LENGTH)
      .regex(PROMPT_LABEL_REGEX, PROMPT_LABEL_REGEX_ERROR),
  )
  .refine((labels) => !labels.includes(LATEST_PROMPT_LABEL), {
    message: "Label 'latest' is always assigned to the latest prompt version",
  })
  .describe(
    "Array of new labels to assign to the prompt version. The 'latest' label is auto-managed and cannot be supplied.",
  );
