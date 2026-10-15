import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import type { RouterOutputs } from "@/src/utils/api";

type Connection = RouterOutputs["aiGateway"]["listModelConnections"][number];
type RefreshResult = RouterOutputs["aiGateway"]["refreshModels"][number];

const providerFormats = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
} as const satisfies Record<GatewayProvider, readonly string[]>;

export type ApiFormat = (typeof providerFormats)[GatewayProvider][number];

type ModelRow = {
  id: string;
  connectionId: string;
  connectionName: string;
  provider: GatewayProvider;
  apiFormats: ApiFormat[];
};

export function aggregateModels(
  results: RefreshResult[],
  connections: Connection[],
): ModelRow[] {
  const resultsByConnectionId = new Map(
    results.map((result) => [result.connectionId, result]),
  );
  const models: ModelRow[] = [];
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
      if (!isGatewayModelAllowed(allowedModels, modelId)) continue;
      models.push({
        id: formatGatewayModelSlug(connection.name, modelId),
        connectionId: connection.id,
        connectionName: connection.name,
        provider: connection.provider,
        apiFormats: [...providerFormats[connection.provider]],
      });
    }
  }

  return models;
}
