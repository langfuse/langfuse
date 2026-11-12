import type { GatewayModelPatternSuggestion } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/components/GatewayApiKeyModelsField/types/gatewayModelPatternSuggestion";
import { toTypedGatewayModelPattern } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/CreateGatewayApiKeyDialogController/components/CreateGatewayApiKeyDialog/fns/toTypedGatewayModelPattern";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

const EXCLUDE_PREFIX = "-";
const MAX_MODEL_SUGGESTIONS = 50;

const toConnectionName = (slug: string) => slug.split(":")[0];

/**
 * Without a query: "All enabled models" and one `connection:*` per connection.
 * With a query: matching connections and models, then the query as a pattern
 * (see toTypedGatewayModelPattern). A query with a wildcard is offered first,
 * so Enter adds it as typed.
 */
export function getGatewayModelPatternSuggestions(
  query: string,
  enabledModels: readonly GatewayEnabledModel[],
): GatewayModelPatternSuggestion[] {
  const connectionNames = [
    ...new Set(enabledModels.map((model) => toConnectionName(model.slug))),
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
  const models = enabledModels
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
