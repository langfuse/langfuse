export function parseGatewayModelSlug(model: string) {
  const separatorIndex = model.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === model.length - 1) {
    return null;
  }

  return {
    connectionName: model.slice(0, separatorIndex),
    providerModel: model.slice(separatorIndex + 1),
  };
}
