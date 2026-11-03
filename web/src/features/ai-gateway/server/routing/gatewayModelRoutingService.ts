import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";

export class GatewayModelRoutingService {
  resolve<Connection extends GatewayRouteConnection>(
    model: string,
    connections: readonly Connection[],
    aliases: readonly GatewayRouteAlias[] = [],
  ): {
    connection: Connection | null;
    providerModel: string;
    viaAlias: boolean;
  } | null {
    // Aliases win over every other match: an alias name may also collide with
    // a connection name or a prefix heuristic, and the alias is explicit.
    const alias = aliases.find((candidate) => candidate.name === model);
    if (alias && alias.status === "ENABLED") {
      for (const target of alias.targets) {
        const connection = connections.find(
          (candidate) => candidate.id === target.connectionId,
        );
        // Connections are pre-filtered to enabled ones serving this format, so
        // a miss falls through to the next target.
        if (!connection) continue;
        return {
          connection,
          providerModel: target.providerModel,
          viaAlias: true,
        };
      }
    }

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
        viaAlias: false,
      };
    }

    if (model.startsWith("ft:")) {
      return {
        connection: findImplicitConnection(model, connections, "OPENAI"),
        providerModel: model,
        viaAlias: false,
      };
    }

    if (modelSlug) {
      return {
        connection: null,
        providerModel: modelSlug.providerModel,
        viaAlias: false,
      };
    }

    if (model.includes(":")) return null;

    let provider: "OPENAI" | "ANTHROPIC" | null = null;
    if (model.startsWith("gpt-") || model.startsWith("codex-")) {
      provider = "OPENAI";
    }
    if (model.startsWith("claude-")) provider = "ANTHROPIC";
    if (!provider) return null;

    return {
      connection: findImplicitConnection(model, connections, provider),
      providerModel: model,
      viaAlias: false,
    };
  }
}

function findImplicitConnection<Connection extends GatewayRouteConnection>(
  model: string,
  connections: readonly Connection[],
  provider: "OPENAI" | "ANTHROPIC",
) {
  let firstProviderConnection: Connection | null = null;
  for (const connection of connections) {
    if (connection.provider !== provider) continue;
    if (!firstProviderConnection) firstProviderConnection = connection;
    if (isGatewayModelAllowed(connection.allowedModels, model)) {
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
  id: string;
  name: string;
  provider: string;
  allowedModels: Set<string> | readonly string[] | null;
};

export type GatewayRouteAlias = {
  name: string;
  status: "ENABLED" | "DISABLED";
  targets: { connectionId: string; providerModel: string }[];
};
