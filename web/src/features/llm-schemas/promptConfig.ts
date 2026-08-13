import { z } from "zod";
import {
  LLMJSONSchema,
  LLMToolDefinitionSchema,
  type LLMToolDefinition,
} from "@langfuse/shared";

/**
 * Tool and schema shapes returned to the playground. They are declared here
 * rather than imported from the playground so that prompts can consume this
 * module without depending on the playground feature. Both are structurally
 * assignable to `PlaygroundTool` / `PlaygroundSchema`, which only add optional
 * references to a linked LLM tool/schema resource.
 */
export type PromptConfigTool = LLMToolDefinition & { id: string };
export type PromptConfigSchema = {
  id: string;
  name: string;
  description: string;
  schema: z.infer<typeof LLMJSONSchema>;
};

/**
 * Slice of `prompt.config` used to round-trip a structured output schema
 * between the LLM playground and saved prompts.
 */
const StructuredOutputConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: LLMJSONSchema,
});

/**
 * OpenAI-shaped `response_format`, the key the Langfuse docs use to document
 * structured output on a prompt config. Read as a fallback and written
 * alongside `structuredOutputSchema` so hand-written prompts following the docs
 * load in the UI. `description` is optional because the documented shape does
 * not require it.
 */
const ResponseFormatConfigSchema = z.object({
  type: z.literal("json_schema"),
  json_schema: z.object({
    name: z.string(),
    description: z.string().optional(),
    schema: LLMJSONSchema,
  }),
});

/** Config keys owned by the playground; callers strip these before re-applying. */
export const PLAYGROUND_CONFIG_KEYS = [
  "tools",
  "structuredOutputSchema",
  "response_format",
] as const;

const generateId = () => Math.random().toString(36).substring(2);

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Extracts playground tools and structured output schema persisted on a
 * prompt's `config`. Tools and schema are parsed independently and malformed
 * tool entries are skipped, so one bad entry never discards valid siblings.
 * The schema is read from `structuredOutputSchema` first and falls back to the
 * documented `response_format.json_schema`.
 */
export function parsePlaygroundConfig(config: unknown): {
  tools: PromptConfigTool[];
  structuredOutputSchema: PromptConfigSchema | null;
} {
  const record = toRecord(config);

  const rawTools = Array.isArray(record.tools) ? record.tools : [];
  const tools = rawTools.flatMap((tool) => {
    const parsed = LLMToolDefinitionSchema.safeParse(tool);
    return parsed.success ? [{ ...parsed.data, id: generateId() }] : [];
  });

  const parsedSchema = StructuredOutputConfigSchema.safeParse(
    record.structuredOutputSchema,
  );
  if (parsedSchema.success) {
    return {
      tools,
      structuredOutputSchema: { ...parsedSchema.data, id: generateId() },
    };
  }

  const parsedResponseFormat = ResponseFormatConfigSchema.safeParse(
    record.response_format,
  );
  if (parsedResponseFormat.success) {
    const { name, description, schema } = parsedResponseFormat.data.json_schema;
    return {
      tools,
      structuredOutputSchema: {
        name,
        description: description ?? "",
        schema,
        id: generateId(),
      },
    };
  }

  return { tools, structuredOutputSchema: null };
}

/**
 * Builds the playground slice of a prompt's `config` from playground state,
 * dropping client-only fields (ids, linked-resource references). Keys are
 * omitted entirely when empty so prompts without tools/schema stay clean. A
 * structured output schema is written under both `structuredOutputSchema` and
 * the documented `response_format` so either reader picks it up.
 */
export function buildPlaygroundConfig({
  tools,
  structuredOutputSchema,
}: {
  tools?: Pick<LLMToolDefinition, "name" | "description" | "parameters">[];
  structuredOutputSchema?: Omit<PromptConfigSchema, "id"> | null;
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
    config.response_format = {
      type: "json_schema",
      json_schema: { name, description, schema, strict: true },
    };
  }

  return config;
}

/**
 * Merges playground state into an existing prompt config. Playground-owned keys
 * are always dropped before the new ones are applied, so tools or a schema the
 * user cleared in the playground are not inherited from the previous config.
 * Keys the playground does not own (model, temperature, ...) survive untouched.
 */
export function mergePlaygroundConfig(
  existingConfig: unknown,
  playgroundState: Parameters<typeof buildPlaygroundConfig>[0],
): Record<string, unknown> {
  const merged = { ...toRecord(existingConfig) };
  for (const key of PLAYGROUND_CONFIG_KEYS) delete merged[key];

  return { ...merged, ...buildPlaygroundConfig(playgroundState) };
}
