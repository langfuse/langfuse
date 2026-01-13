/**
 * MCP Core Validation Schemas
 *
 * Pre-defined Zod v4 schemas for common cross-feature parameters.
 * Feature-specific validation schemas live in their respective feature directories.
 *
 * @example
 * // Prompt-specific schemas:
 * import { ParamPromptName } from "../features/prompts/validation";
 *
 * // Cross-feature schemas:
 * import { ParamProjectId, ParamLimit } from "../core/validation";
 */

import { z } from "zod/v4";

/**
 * Project ID parameter
 * No format enforcement - validated via API key authentication
 */
export const ParamProjectId = z.string().describe("The project ID");

/**
 * Pagination limit parameter
 * Defaults to 50, max 100
 */
export const ParamLimit = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .default(50)
  .describe("Number of items to return (1-100, default: 50)");

/**
 * Pagination page parameter
 * Defaults to 1
 */
export const ParamPage = z.coerce
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("Page number for pagination (default: 1)");

/**
 * Helper to extract schema description for MCP tool definitions
 */
export function getSchemaDescription(schema: z.ZodType): string | undefined {
  return schema.description;
}
