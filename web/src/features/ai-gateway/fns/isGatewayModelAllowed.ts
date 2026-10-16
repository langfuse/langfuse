export function isGatewayModelAllowed(
  allowedModels: Set<string> | readonly string[] | null,
  model: string,
) {
  if (allowedModels === null) return true;
  return allowedModels instanceof Set
    ? allowedModels.has(model)
    : allowedModels.includes(model);
}
