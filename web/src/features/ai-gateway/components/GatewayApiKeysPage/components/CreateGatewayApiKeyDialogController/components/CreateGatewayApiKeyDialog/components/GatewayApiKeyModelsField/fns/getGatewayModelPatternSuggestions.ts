import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import {
  isGatewayModelExcludePattern,
  matchesGatewayModelPatterns,
  toTypedGatewayModelPattern,
} from "@/src/features/ai-gateway/fns/gatewayModelPatterns";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const EXCLUDE_PREFIX = "-";
const MAX_MODEL_SUGGESTIONS = 50;

const toConnectionName = (slug: string) => slug.split(":")[0];

/**
 * Without a query: "All enabled models" and one `connection:*` per connection;
 * with only `-`, one `-connection:*` per connection.
 * With a query: matching connections and models, then the query as a pattern
 * (see toTypedGatewayModelPattern). A query with a wildcard is offered first,
 * so Enter adds it as typed. Models the current exclude patterns remove are
 * not suggested, nor are connections without any other model.
 */
export function getGatewayModelPatternSuggestions(
  query: string,
  enabledModels: readonly GatewayEnabledModel[],
  patterns: readonly string[],
): GatewayModelPatternSuggestion[] {
  const excludes = patterns.filter(isGatewayModelExcludePattern);
  const suggestableModels = enabledModels.filter((model) =>
    matchesGatewayModelPatterns(excludes, model.slug),
  );
  const connectionNames = [
    ...new Set(suggestableModels.map((model) => toConnectionName(model.slug))),
  ];
  const trimmed = query.trim();
  if (!trimmed) {
    return [
      { kind: "all-models", pattern: null },
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
