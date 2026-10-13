export function formatGatewayModelSlug(
  connectionName: string,
  providerModel: string,
) {
  return `${connectionName}/${providerModel}`;
}

export function parseGatewayModelSlug(model: string) {
  const separatorIndex = model.indexOf("/");
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
