/**
 * Prompts Feature Validation Schemas
 *
 * Zod v4 schemas specific to the prompts feature domain.
 * Common cross-feature validations live in /core/validation.ts
 */

import { z } from "zod/v4";

/**
 * Prompt name parameter
 * Must match existing Langfuse prompt name validation
 */
export const ParamPromptName = z
  .string()
  .min(1)
  .max(255)
  .describe("The name of the prompt");

/**
 * Prompt label parameter (optional)
 * Defaults to "production" if not specified
 */
export const ParamPromptLabel = z
  .string()
  .min(1)
  .max(36)
  .regex(
    /^[a-z0-9_\-.]+$/,
    "Label must be lowercase alphanumeric with optional underscores, hyphens, or periods",
  )
  .optional()
  .describe(
    'Label to retrieve (e.g., "production", "staging"). Defaults to "production".',
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
  .max(500)
  .optional()
  .describe("Optional commit message describing the changes");

/**
 * New labels array for updating prompt labels
 */
export const ParamNewLabels = z
  .array(
    z
      .string()
      .min(1)
      .max(36)
      .regex(
        /^[a-z0-9_\-.]+$/,
        "Label must be lowercase alphanumeric with optional underscores, hyphens, or periods",
      ),
  )
  .refine((labels) => !labels.includes("latest"), {
    message: "Label 'latest' is always assigned to the latest prompt version",
  })
  .describe("Array of new labels to assign to the prompt version");
