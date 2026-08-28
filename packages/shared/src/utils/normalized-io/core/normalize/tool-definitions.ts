import { registeredProviders } from "../../conventions";
import {
  asRecord,
  compact,
  isRecord,
  parseIfString,
  parseRecord,
  remainingProviderMetadata,
  toJsonValue,
} from "../utils/json";
import type { JsonObject, ToolDefinition } from "../../types";

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
  const explicit = asRecord(wrapper.providerMetadata);
  return remainingProviderMetadata(
    [wrapper, definition],
    CONSUMED_DEFINITION_KEYS,
    explicit,
  );
}

/**
 * Tool-definition normalization. Carrier mechanics (array / single record /
 * name-keyed map, JSON-string boundaries) live here; per-item recognition
 * folds the registry's `tryNormalizeToolDefinition`, with a loose fallback
 * for bare items no dialect claims. Pure: the accumulator collector owns
 * accumulation/merge.
 */

type ToolDefinitionOptions = {
  allowProviderToolWithoutName?: boolean;
  allowToolMap?: boolean;
};

/**
 * Loose fallback: bare `{name, description | desc, parameters}` items
 * (`parameters` is shared openai/gemini vocabulary) and — with the
 * carrier's allowance — nameless provider built-ins, named by their
 * `id`/`type` (openai `web_search_preview`, anthropic server tools, gemini
 * `googleSearch`-style groups).
 */
function normalizeLooseToolDefinition(
  value: Record<string, unknown>,
  options: ToolDefinitionOptions,
): ToolDefinition | null {
  const rawName =
    value.name ??
    (options.allowProviderToolWithoutName
      ? (value.id ?? (value.type !== "function" ? value.type : undefined))
      : undefined);

  return toolDefinition({
    name: rawName,
    description: value.description ?? value.desc /* loose/traceloop */,
    inputSchema: value.parameters /* openai, gemini */,
    type: value.type,
    providerMetadata: toolDefinitionProviderMetadata(value, value),
  });
}

function normalizeDefinitionItem(
  value: unknown,
  options: ToolDefinitionOptions,
): ToolDefinition | null {
  if (!isRecord(value)) return null;

  for (const provider of registeredProviders) {
    const result = provider.tryNormalizeToolDefinition?.(value);
    if (result?.matched) return result.value;
  }

  return normalizeLooseToolDefinition(value, options);
}

/**
 * Normalizes one tool-definition carrier value: an array, a single
 * definition record, or (with `allowToolMap`) a map keyed by tool name.
 */
export function normalizeToolDefinitionValue(
  value: unknown,
  options: ToolDefinitionOptions = {},
): ToolDefinition[] {
  const parsed = parseIfString(value);

  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeDefinitionItem(parseIfString(item), options))
      .filter((def): def is ToolDefinition => def !== null);
  }

  if (!isRecord(parsed)) return [];

  const singleDefinition = normalizeDefinitionItem(parsed, options);
  if (singleDefinition) return [singleDefinition];

  if (!options.allowToolMap) return [];

  // Some instrumentation exports definitions as a map keyed by tool name.
  const definitions: ToolDefinition[] = [];
  for (const [name, rawDefinition] of Object.entries(parsed)) {
    const definition = parseRecord(rawDefinition);
    if (!definition) continue;

    const normalized = normalizeDefinitionItem({ name, ...definition }, {});
    if (normalized) definitions.push(normalized);
  }
  return definitions;
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

  return compact<ToolDefinition>({
    name: fields.name,
    description:
      typeof fields.description === "string" ? fields.description : undefined,
    inputSchema:
      fields.inputSchema === undefined
        ? undefined
        : toJsonValue(parseIfString(fields.inputSchema)),
    type: typeof fields.type === "string" ? fields.type : undefined,
    providerMetadata: fields.providerMetadata,
  });
}
