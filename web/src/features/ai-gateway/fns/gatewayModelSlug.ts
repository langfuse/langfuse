export function formatGatewayModelSlug(
  connectionName: string,
  providerModel: string,
) {
  return `${connectionName}:${providerModel}`;
}

export function resolveGatewayModelRoute<
  Connection extends GatewayRouteConnection,
>(
  model: string,
  connections: readonly Connection[],
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
      connection:
        connections.find((connection) => connection.provider === "OPENAI") ??
        null,
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
  if (model.startsWith("gpt-")) provider = "OPENAI";
  if (model.startsWith("claude-")) provider = "ANTHROPIC";
  if (!provider) return null;

  return {
    connection:
      connections.find((connection) => connection.provider === provider) ??
      null,
    providerModel: model,
  };
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
};
