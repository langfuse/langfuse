import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { isOpenAiEmbeddingModel } from "@/src/features/ai-gateway/fns/isOpenAiEmbeddingModel";
import type { GatewayApiFormat } from "@/src/features/ai-gateway/server/provider/registry";

export class GatewayModelRoutingService {
  resolve<Connection extends GatewayRouteConnection>(
    model: string,
    connections: readonly Connection[],
    apiFormat?: GatewayApiFormat,
    /** The calling key's model patterns; implicit routing skips connections they deny. */
    keyAllowedModels: readonly string[] | null = null,
  ): { connection: Connection | null; providerModel: string } | null {
    const modelSlug = parseGatewayModelSlug(model);
    const explicitConnection = modelSlug
      ? (connections.find(
          (connection) => connection.name === modelSlug.connectionName,
        ) ?? null)
      : null;
    if (modelSlug && explicitConnection) {
      return {
        connection: explicitConnection,
        providerModel: modelSlug.providerModel,
      };
    }

    if (model.startsWith("ft:")) {
      return {
        connection: findImplicitConnection(
          model,
          connections,
          "OPENAI",
          keyAllowedModels,
        ),
        providerModel: model,
      };
    }

    if (modelSlug) {
      return {
        connection: null,
        providerModel: modelSlug.providerModel,
      };
    }

    if (model.includes(":")) return null;

    let provider: "OPENAI" | "ANTHROPIC" | null = null;
    if (model.startsWith("gpt-") || model.startsWith("codex-")) {
      provider = "OPENAI";
    }
    // Scoped to Embeddings so other formats keep rejecting embedding models.
    if (apiFormat === "openai.embeddings" && isOpenAiEmbeddingModel(model)) {
      provider = "OPENAI";
    }
    if (model.startsWith("claude-")) provider = "ANTHROPIC";
    if (!provider) return null;

    return {
      connection: findImplicitConnection(
        model,
        connections,
        provider,
        keyAllowedModels,
      ),
      providerModel: model,
    };
  }
}

function findImplicitConnection<Connection extends GatewayRouteConnection>(
  model: string,
  connections: readonly Connection[],
  provider: "OPENAI" | "ANTHROPIC",
  keyAllowedModels: readonly string[] | null,
) {
  let firstProviderConnection: Connection | null = null;
  for (const connection of connections) {
    if (connection.provider !== provider) continue;
    if (!firstProviderConnection) firstProviderConnection = connection;
    if (
      isGatewayModelAllowed(connection.allowedModels, model, {
        connectionName: connection.name,
        allowedModels: keyAllowedModels,
      })
    ) {
      return connection;
    }
  }
  return firstProviderConnection;
}

function parseGatewayModelSlug(model: string) {
  const separatorIndex = model.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }
  const providerModel = model.slice(separatorIndex + 1);
  if (!providerModel.trim()) return null;

  return {
    connectionName: model.slice(0, separatorIndex),
    providerModel,
  };
}

type GatewayRouteConnection = {
  name: string;
  provider: string;
  allowedModels: Set<string> | readonly string[] | null;
};
