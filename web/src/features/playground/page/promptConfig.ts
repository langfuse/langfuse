import { z } from "zod";
import { LLMJSONSchema, LLMToolDefinitionSchema } from "@langfuse/shared";

import { type PlaygroundSchema, type PlaygroundTool } from "./types";

/**
 * Slice of `prompt.config` used to round-trip playground tools and structured
 * output schemas between the LLM playground and saved prompts. Stored alongside
 * any other user-defined config keys, so parsing is intentionally lenient.
 */
const PlaygroundPromptConfigSchema = z
  .object({
    tools: z.array(LLMToolDefinitionSchema).optional(),
    structuredOutputSchema: z
      .object({
        name: z.string(),
        description: z.string(),
        schema: LLMJSONSchema,
      })
      .optional(),
  })
  .loose();

/** Config keys owned by the playground; callers strip these before re-applying. */
export const PLAYGROUND_CONFIG_KEYS = [
  "tools",
  "structuredOutputSchema",
] as const;

const generateId = () => Math.random().toString(36).substring(2);

/**
 * Extracts playground tools and structured output schema persisted on a
 * prompt's `config`. Returns empty defaults when the config does not contain
 * (valid) playground state.
 */
export function parsePlaygroundConfig(config: unknown): {
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
} {
  const parsed = PlaygroundPromptConfigSchema.safeParse(config);
  if (!parsed.success) return { tools: [], structuredOutputSchema: null };

  const tools = (parsed.data.tools ?? []).map((tool) => ({
    ...tool,
    id: generateId(),
  }));

  const structuredOutputSchema = parsed.data.structuredOutputSchema
    ? { ...parsed.data.structuredOutputSchema, id: generateId() }
    : null;

  return { tools, structuredOutputSchema };
}

/**
 * Builds the playground slice of a prompt's `config` from playground state,
 * dropping client-only fields (ids, linked-resource references). Keys are
 * omitted entirely when empty so prompts without tools/schema stay clean.
 */
export function buildPlaygroundConfig({
  tools,
  structuredOutputSchema,
}: {
  tools?: PlaygroundTool[];
  structuredOutputSchema?: PlaygroundSchema | null;
}): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  if (tools && tools.length > 0) {
    config.tools = tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  if (structuredOutputSchema) {
    const { name, description, schema } = structuredOutputSchema;
    config.structuredOutputSchema = { name, description, schema };
  }

  return config;
}
