export function updateGatewayAllowedModels({
  allowedModels,
  availableModels,
  targetModels,
  enabled,
}: {
  allowedModels: string[] | null;
  availableModels: string[];
  targetModels: string[];
  enabled: boolean;
}) {
  const nextAllowedModels = new Set(
    allowedModels === null ? availableModels : allowedModels,
  );

  for (const model of targetModels) {
    if (enabled) nextAllowedModels.add(model);
    else nextAllowedModels.delete(model);
  }

  if (
    availableModels.length > 0 &&
    availableModels.every((model) => nextAllowedModels.has(model))
  ) {
    return null;
  }
  return [...nextAllowedModels];
}
