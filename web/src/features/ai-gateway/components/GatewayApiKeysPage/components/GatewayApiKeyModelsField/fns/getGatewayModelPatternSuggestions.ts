import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import {
  isGatewayModelExcludePattern,
  matchesGatewayModelPatterns,
  toTypedGatewayModelPattern,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";

const EXCLUDE_PREFIX = "-";
const MAX_MODEL_SUGGESTIONS = 50;

const toConnectionName = (slug: string) => slug.split(":")[0];

/**
 * Without a query: "All enabled models" (only while no pattern is set, so
 * Enter can't clear the patterns) and one `connection:*` per connection;
 * with only `-`, one `-connection:*` per connection.
 * With a query: matching connections and models, then the query as a pattern
 * (see toTypedGatewayModelPattern). A query with a wildcard is offered first,
 * so Enter adds it as typed. Models the current exclude patterns remove are
 * not suggested, nor are connections without any other model. A connection
 * whose catalog is unknown is suggested unless an exclude covers all of it.
 */
export function getGatewayModelPatternSuggestions(
  query: string,
  enabledModels: GatewayEnabledModels,
  patterns: readonly string[],
): GatewayModelPatternSuggestion[] {
  const excludes = patterns.filter(isGatewayModelExcludePattern);
  const suggestableModels = enabledModels.models.filter((model) =>
    matchesGatewayModelPatterns(excludes, model.slug),
  );
  const modelConnectionNames = new Set(
    suggestableModels.map((model) => toConnectionName(model.slug)),
  );
  const connectionNames = enabledModels.connections
    .filter((connection) =>
      connection.isCatalogUnknown
        ? matchesGatewayModelPatterns(excludes, `${connection.name}:*`)
        : modelConnectionNames.has(connection.name),
    )
    .map((connection) => connection.name);
  const trimmed = query.trim();
  if (!trimmed) {
    return [
      ...(patterns.length === 0
        ? [{ kind: "all-models" as const, pattern: null }]
        : []),
      ...connectionNames.map((name) => ({
        kind: "connection" as const,
        pattern: `${name}:*`,
      })),
    ];
  }

  const prefix = trimmed.startsWith(EXCLUDE_PREFIX) ? EXCLUDE_PREFIX : "";
  const term = trimmed.slice(prefix.length);
  if (!term) {
    return connectionNames.map((name) => ({
      kind: "connection" as const,
      pattern: `${prefix}${name}:*`,
    }));
  }
  const typedPattern = toTypedGatewayModelPattern(trimmed);
  if (typedPattern === null) return [];

  const needle = term.toLowerCase();
  const hasWildcard = term.includes("*");
  const connections = connectionNames
    .filter((name) => name.toLowerCase().includes(needle))
    .map((name) => ({
      kind: "connection" as const,
      pattern: `${prefix}${name}:*`,
    }));
  const models = suggestableModels
    .filter((model) => model.slug.toLowerCase().includes(needle))
    .slice(0, MAX_MODEL_SUGGESTIONS)
    .map((model) => ({
      kind: "model" as const,
      pattern: `${prefix}${model.slug}`,
      provider: model.provider,
    }));

  const matches = [...connections, ...models].filter(
    (suggestion) => suggestion.pattern !== typedPattern,
  );
  const typed = { kind: "typed-pattern" as const, pattern: typedPattern };
  return hasWildcard ? [typed, ...matches] : [...matches, typed];
}
