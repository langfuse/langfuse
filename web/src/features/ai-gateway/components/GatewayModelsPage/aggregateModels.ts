import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type { RouterOutputs } from "@/src/utils/api";

type Connection = RouterOutputs["aiGateway"]["listConnections"]["data"][number];
type RefreshResult = RouterOutputs["aiGateway"]["refreshModels"][number];

const providerFormats = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
} as const satisfies Record<GatewayProvider, readonly string[]>;

export type ApiFormat = (typeof providerFormats)[GatewayProvider][number];

type ModelRow = {
  id: string;
  availableVia: Array<{
    connectionId: string;
    connectionName: string;
    provider: GatewayProvider;
    enabled: boolean;
  }>;
  apiFormats: ApiFormat[];
};

export function aggregateModels(
  results: RefreshResult[],
  connections: Connection[],
): ModelRow[] {
  const resultsByConnectionId = new Map(
    results.map((result) => [result.connectionId, result]),
  );
  const models = new Map<string, ModelRow>();
  const seenConnectionIds = new Set<string>();

  for (const connection of connections) {
    if (seenConnectionIds.has(connection.id)) continue;
    seenConnectionIds.add(connection.id);
    const result = resultsByConnectionId.get(connection.id);
    if (!result?.success) continue;
    const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
    for (const modelId of result.models.toSorted((left, right) =>
      left.localeCompare(right),
    )) {
      const availableVia = {
        connectionId: connection.id,
        connectionName: connection.name,
        provider: connection.provider,
        enabled: isGatewayModelAllowed(allowedModels, modelId),
      };
      const existing = models.get(modelId);
      if (existing) {
        existing.availableVia.push(availableVia);
        if (availableVia.enabled) {
          existing.apiFormats = [
            ...new Set([
              ...existing.apiFormats,
              ...providerFormats[connection.provider],
            ]),
          ];
        }
        continue;
      }
      models.set(modelId, {
        id: modelId,
        availableVia: [availableVia],
        apiFormats: availableVia.enabled
          ? [...providerFormats[connection.provider]]
          : [],
      });
    }
  }

  return [...models.values()];
}
