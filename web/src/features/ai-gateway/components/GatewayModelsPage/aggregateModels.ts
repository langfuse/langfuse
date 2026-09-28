import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
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

  for (const connection of connections) {
    const result = resultsByConnectionId.get(connection.id);
    if (!result?.success) continue;
    for (const modelId of result.models.toSorted((left, right) =>
      left.localeCompare(right),
    )) {
      const existing = models.get(modelId);
      const availableVia = {
        connectionId: connection.id,
        connectionName: connection.name,
        provider: connection.provider,
      };
      if (existing) {
        existing.availableVia.push(availableVia);
        existing.apiFormats = [
          ...new Set([
            ...existing.apiFormats,
            ...providerFormats[connection.provider],
          ]),
        ];
      } else {
        models.set(modelId, {
          id: modelId,
          availableVia: [availableVia],
          apiFormats: [...providerFormats[connection.provider]],
        });
      }
    }
  }

  return [...models.values()];
}
