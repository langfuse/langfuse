import { z } from "zod/v4";

/**
 * Prompt filter options (used for building prompt picker/filter UIs).
 *
 * Matches the shape used by internal tRPC `prompts.filterOptions`:
 * { name: [{value}], tags: [{value}], labels: [{value}] }
 */

export const PromptFilterOptionValue = z
  .object({
    value: z.string(),
  })
  .strict();

export const GetPromptFilterOptionsV2Response = z
  .object({
    name: z.array(PromptFilterOptionValue),
    tags: z.array(PromptFilterOptionValue),
    labels: z.array(PromptFilterOptionValue),
  })
  .strict();

