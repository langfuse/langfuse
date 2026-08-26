import { registeredProviders } from "../conventions";
import type { ToolDefinitionSource } from "../conventions/IOConvention";
import { isRecord, parseIfString, parseRecord } from "../json";
import type { ToolDefinition } from "../types";
import { toolDefinition, toolDefinitionProviderMetadata } from "./normalizers";

/**
 * Tool-definition normalization. Carrier mechanics (array / single record /
 * name-keyed map, JSON-string boundaries) live here; per-item recognition
 * folds the registry's `tryNormalizeToolDefinition`, with a loose fallback
 * for bare items no dialect claims. Pure: callers (core/containers.ts) own
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

/** Normalizes every located source and flattens the results in order. */
export function normalizeToolDefinitionSources(
  sources: ToolDefinitionSource[],
): ToolDefinition[] {
  return sources.flatMap((source) =>
    normalizeToolDefinitionValue(source.value, source.options),
  );
}
