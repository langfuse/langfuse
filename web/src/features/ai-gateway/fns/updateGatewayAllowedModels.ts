export function updateGatewayAllowedModels({
  allowedModels,
  availableModels,
  catalogComplete,
  targetModels,
  enabled,
}: {
  allowedModels: string[] | null;
  availableModels: string[];
  /** False when the provider denied listing, so stored models it serves may be missing. */
  catalogComplete: boolean;
  targetModels: string[];
  enabled: boolean;
}) {
  // Disabling a complete catalog also revokes stored models the provider no
  // longer lists, since they have no row left to disable them from.
  if (
    !enabled &&
    catalogComplete &&
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
