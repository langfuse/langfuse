import type {
  GatewayApiFamily,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { getBedrockModelApiFormats } from "@/src/features/ai-gateway/fns/getBedrockModelApiFormats";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";
import type { RouterOutputs } from "@/src/utils/api";

type Connection = RouterOutputs["aiGateway"]["listModelConnections"][number];
type RefreshResult = RouterOutputs["aiGateway"]["refreshModels"][number];

const providerFormats = {
  OPENAI: ["OpenAI Responses", "OpenAI Chat Completions"],
  ANTHROPIC: ["Anthropic Messages"],
} as const satisfies Record<GatewayApiFamily, readonly string[]>;

export type ApiFormat = (typeof providerFormats)[GatewayApiFamily][number];

const apiFormatLabels = {
  "openai.responses": "OpenAI Responses",
  "openai.chat-completions": "OpenAI Chat Completions",
  "anthropic.messages": "Anthropic Messages",
} as const satisfies Record<GatewayApiFormat, ApiFormat>;

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
      const apiFormats = toApiFormats(connection.provider, modelId);
      if (apiFormats.length === 0) continue;
      models.push({
        id: formatGatewayModelSlug(connection.name, modelId),
        connectionId: connection.id,
        connectionName: connection.name,
        provider: connection.provider,
        apiFormats,
      });
    }
  }

  return models;
}

function toApiFormats(provider: GatewayProvider, modelId: string) {
  if (provider !== "BEDROCK") return [...providerFormats[provider]];
  return getBedrockModelApiFormats(modelId).map(
    (apiFormat) => apiFormatLabels[apiFormat],
  );
}
