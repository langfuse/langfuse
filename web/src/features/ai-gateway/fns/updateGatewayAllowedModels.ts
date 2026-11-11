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
  // Disabling the whole catalog also revokes stored models the provider no
  // longer lists, since they have no row left to disable them from.
  if (
    !enabled &&
    availableModels.length > 0 &&
    availableModels.every((model) => targetModels.includes(model))
  ) {
    return [];
  }

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
