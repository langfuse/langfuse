import {
  asRecord,
  compact,
  isRecord,
  nullableString,
  optionalString,
  parseIfString,
  toJsonValue,
  toProviderMetadata,
} from "../json";
import type {
  JsonObject,
  ReasoningPart,
  ToolCallPart,
  ToolDefinition,
  ToolResultPart,
} from "../types";

/**
 * Canonical tool-part constructors. Callers extract their own dialect's
 * fields and pass them here; the flat-sniff fallback in `core/parts.ts` and
 * the otel-genai convention keep deliberately loose extractions for shapes
 * whose dialect is unknown.
 */

export type ToolCallFields = {
  /** Raw id value; coerced via nullableString. */
  toolCallId?: unknown;
  /** Must be a non-empty string, otherwise no part is constructed. */
  toolName: unknown;
  /** Raw arguments payload; one JSON-string boundary is parsed. Defaults {}. */
  input?: unknown;
  toolType?: string;
  /** Kept only when a number (chat-completions streaming index). */
  index?: unknown;
  /** Kept only when a boolean. */
  providerExecuted?: unknown;
};

export function toolCallPart(fields: ToolCallFields): ToolCallPart | null {
  if (typeof fields.toolName !== "string" || fields.toolName.length === 0) {
    return null;
  }

  return compact<ToolCallPart>({
    type: "tool-call",
    toolCallId: nullableString(fields.toolCallId),
    toolName: fields.toolName,
    input: toJsonValue(parseIfString(fields.input ?? {})),
    toolType: fields.toolType,
    index: typeof fields.index === "number" ? fields.index : undefined,
    providerExecuted:
      typeof fields.providerExecuted === "boolean"
        ? fields.providerExecuted
        : undefined,
  });
}

export type ToolResultFields = {
  /** Raw id value; coerced via nullableString. */
  toolCallId?: unknown;
  /** Raw name value; coerced via optionalString. */
  toolName?: unknown;
  /** Raw payload; the builder unwraps output wrappers, parses one
   * JSON-string boundary, and converts to JsonValue. */
  output?: unknown;
  isError?: boolean;
};

// {type, value} output wrappers originate in the AI SDK but echo through
// loose conversions of every dialect, so unwrapping them is canonical
// builder mechanics — the one deliberate residual in this file. error-*
// marks a failed execution.
const OUTPUT_WRAPPER_TYPES = new Set([
  "text",
  "json",
  "content",
  "error-text",
  "error-json",
  "execution-denied",
]);

/**
 * Canonical tool-result constructor. Takes already-extracted fields — the
 * caller (a provider handler, or `toolResultPartFromLooseShape` for
 * dialect-less shapes) owns the field vocabulary; this owns only the
 * mechanics every dialect shares.
 */
export function toolResultPart(fields: ToolResultFields): ToolResultPart {
  const wrapper = asRecord(fields.output);
  const wrapperType = optionalString(wrapper?.type);
  const isWrapped =
    wrapper !== undefined &&
    wrapperType !== undefined &&
    "value" in wrapper &&
    OUTPUT_WRAPPER_TYPES.has(wrapperType);
  const wrapperError =
    isWrapped && wrapperType.startsWith("error") ? true : undefined;

  return compact<ToolResultPart>({
    type: "tool-result",
    toolCallId: nullableString(fields.toolCallId),
    toolName: optionalString(fields.toolName),
    output: toJsonValue(
      parseIfString(isWrapped ? wrapper.value : (fields.output ?? null)),
    ),
    isError: fields.isError ?? wrapperError,
  });
}

/** String payloads become visible reasoning text; everything else is data. */
export function reasoningPart(
  payload: unknown,
  signature?: string,
): ReasoningPart {
  return {
    type: "reasoning",
    content:
      typeof payload === "string"
        ? compact({ kind: "text" as const, text: payload, signature })
        : { kind: "data", value: toJsonValue(payload) },
  };
}

/**
 * Provider-executed named calls (OpenAI mcp_call, Anthropic server_tool_use /
 * mcp_tool_use): decorates an already-extracted call with providerExecuted
 * and provider-side extras (server_label, server_name, output, error) in
 * providerMetadata.
 */
export function providerExecutedToolCall(
  part: ToolCallPart | null,
  extras?: Record<string, unknown>,
): ToolCallPart | null {
  if (!part) return null;

  return compact<ToolCallPart>({
    ...part,
    providerExecuted: true,
    providerMetadata: extras ? toProviderMetadata(extras) : undefined,
  });
}

export type ToolDefinitionFields = {
  /** Must be a non-empty string, otherwise no definition is constructed. */
  name: unknown;
  /** Kept only when a string. */
  description?: unknown;
  /** Raw schema payload; one JSON-string boundary is parsed. */
  inputSchema?: unknown;
  /** Kept only when a string. */
  type?: unknown;
  providerMetadata?: JsonObject;
};

/** Canonical tool-definition constructor — same contract as the tool-part
 * builders: callers extract their own dialect's fields. */
export function toolDefinition(
  fields: ToolDefinitionFields,
): ToolDefinition | null {
  if (typeof fields.name !== "string" || fields.name.length === 0) return null;

  return {
    name: fields.name,
    description:
      typeof fields.description === "string" ? fields.description : undefined,
    inputSchema:
      fields.inputSchema === undefined
        ? undefined
        : toJsonValue(parseIfString(fields.inputSchema)),
    type: typeof fields.type === "string" ? fields.type : undefined,
    providerMetadata: fields.providerMetadata,
  };
}

// Keys consumed as definition fields by SOME dialect's extraction; everything
// else on a definition record is provider trivia lifted verbatim into
// providerMetadata. A union by necessity: metadata inference must know every
// dialect's consumed keys regardless of which extractor claimed the item.
const CONSUMED_DEFINITION_KEYS = new Set([
  "name",
  "description",
  "desc", // loose/traceloop
  "parameters", // openai, gemini
  "parameters_json_schema", // pydantic ai
  "input_schema", // anthropic
  "inputSchema", // ai sdk / mcp
  "format", // openai custom tools
  "function", // openai function-tool wrapper
  "custom", // openai custom-tool wrapper
  "type",
  "providerMetadata",
]);

/** Provider trivia beside the consumed definition fields, wrapper and inner
 * definition merged, explicit `providerMetadata` winning on collisions. */
export function toolDefinitionProviderMetadata(
  wrapper: Record<string, unknown>,
  definition: Record<string, unknown>,
): JsonObject | undefined {
  const inferred = Object.fromEntries(
    [...Object.entries(wrapper), ...Object.entries(definition)].filter(
      ([key]) => !CONSUMED_DEFINITION_KEYS.has(key),
    ),
  );
  const explicit = asRecord(wrapper.providerMetadata);
  const providerMetadata = toJsonValue({ ...inferred, ...explicit });

  return isRecord(providerMetadata) && Object.keys(providerMetadata).length > 0
    ? providerMetadata
    : undefined;
}
