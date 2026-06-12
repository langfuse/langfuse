import { z } from "zod";
import { LLMJSONSchema, LLMToolDefinitionSchema } from "@langfuse/shared";

import { type PlaygroundSchema, type PlaygroundTool } from "./types";

/**
 * Slice of `prompt.config` used to round-trip a structured output schema
 * between the LLM playground and saved prompts.
 */
const StructuredOutputConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: LLMJSONSchema,
});

/** Config keys owned by the playground; callers strip these before re-applying. */
export const PLAYGROUND_CONFIG_KEYS = [
  "tools",
  "structuredOutputSchema",
] as const;

const generateId = () => Math.random().toString(36).substring(2);

/**
 * Extracts playground tools and structured output schema persisted on a
 * prompt's `config`. Tools and schema are parsed independently and malformed
 * tool entries are skipped, so one bad entry never discards valid siblings.
 */
export function parsePlaygroundConfig(config: unknown): {
  tools: PlaygroundTool[];
  structuredOutputSchema: PlaygroundSchema | null;
} {
  const record =
    config && typeof config === "object" && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  const rawTools = Array.isArray(record.tools) ? record.tools : [];
  const tools = rawTools.flatMap((tool) => {
    const parsed = LLMToolDefinitionSchema.safeParse(tool);
    return parsed.success ? [{ ...parsed.data, id: generateId() }] : [];
  });

  const parsedSchema = StructuredOutputConfigSchema.safeParse(
    record.structuredOutputSchema,
  );
  const structuredOutputSchema = parsedSchema.success
    ? { ...parsedSchema.data, id: generateId() }
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
