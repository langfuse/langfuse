export const GATEWAY_MODEL_CONNECTION_SEPARATOR = "/";

export function qualifyGatewayModelId(
  connectionName: string,
  modelId: string,
): string {
  return `${connectionName}${GATEWAY_MODEL_CONNECTION_SEPARATOR}${modelId}`;
}

export function parseGatewayModelId(modelId: string): {
  connectionName: string;
  upstreamModelId: string;
} | null {
  const separatorIndex = modelId.indexOf(GATEWAY_MODEL_CONNECTION_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === modelId.length - 1) return null;

  return {
    connectionName: modelId.slice(0, separatorIndex),
    upstreamModelId: modelId.slice(
      separatorIndex + GATEWAY_MODEL_CONNECTION_SEPARATOR.length,
    ),
  };
}
