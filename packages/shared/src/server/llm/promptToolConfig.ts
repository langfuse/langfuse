import z from "zod";

import {
  LLMJSONSchema,
  LLMToolDefinitionSchema,
  LLMToolNameSchema,
  OpenAIToolSchema,
  type LLMToolDefinition,
} from "./types";

const EMPTY_TOOL_PARAMETERS = { type: "object", properties: {} };

const PromptToolDefinitionSchema = LLMToolDefinitionSchema.extend({
  name: LLMToolNameSchema,
  // OpenAI-compatible prompt configs may omit or explicitly null these fields.
  // Keep the runtime representation complete for createLLMToolSet.
  description: z
    .string()
    .nullish()
    .transform((value) => value ?? ""),
  parameters: LLMJSONSchema.nullish().transform(
    (value) => value ?? EMPTY_TOOL_PARAMETERS,
  ),
});

const PromptConfigToolSchema = z.union([
  PromptToolDefinitionSchema,
  OpenAIToolSchema.extend({
    function: PromptToolDefinitionSchema,
  }).transform((tool) => tool.function),
]);

export type PromptToolConfig =
  | { status: "none" }
  | { status: "valid"; tools: LLMToolDefinition[] }
  | { status: "invalid" };

export const PROMPT_TOOL_STRUCTURED_OUTPUT_CONFLICT_MESSAGE =
  "Your prompt contains tool definitions - tool calls are not compatible with structured output";

export const hasPromptToolStructuredOutputConflict = (
  toolConfig: PromptToolConfig,
  structuredOutputEnabled: boolean,
) => toolConfig.status === "valid" && structuredOutputEnabled;

/**
 * Extracts LLM tool definitions from a prompt's free-form `config` JSON.
 *
 * Accepts both the flat Langfuse shape (`{name, description, parameters}`)
 * and the OpenAI wrapper (`{type: "function", function: {...}}`).
 *
 * - `none`: config carries no tools — nothing to pass, nothing to warn about.
 * - `valid`: every entry parsed; pass `tools` to the LLM call.
 * - `invalid`: a `tools` key exists but cannot be used as a whole (not an
 *   array, an entry is malformed, or duplicate tool names). Callers must
 *   ignore ALL tools and surface a warning — running with a silently
 *   altered tool set would be worse than running without tools.
 */
export function parsePromptToolConfig(config: unknown): PromptToolConfig {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { status: "none" };
  }
  if (!("tools" in config)) {
    return { status: "none" };
  }

  const rawTools = (config as Record<string, unknown>).tools;
  if (rawTools === null || rawTools === undefined) {
    return { status: "none" };
  }
  if (!Array.isArray(rawTools)) {
    return { status: "invalid" };
  }
  if (rawTools.length === 0) {
    return { status: "none" };
  }

  const parsed = z.array(PromptConfigToolSchema).safeParse(rawTools);
  if (!parsed.success) {
    return { status: "invalid" };
  }

  const uniqueNames = new Set(parsed.data.map((tool) => tool.name));
  if (uniqueNames.size !== parsed.data.length) {
    return { status: "invalid" };
  }

  return { status: "valid", tools: parsed.data };
}
