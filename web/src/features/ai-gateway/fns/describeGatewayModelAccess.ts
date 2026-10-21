const enabledModelsRule =
  "Only enabled models can be requested through this credential.";

export function describeGatewayModelAccess(allowedModels: string[] | null) {
  const futureModelsAreEnabled = allowedModels === null;

  return {
    rule: enabledModelsRule,
    impact: futureModelsAreEnabled
      ? "While every model is enabled, models this provider adds later are enabled too."
      : "While any model is disabled, models this provider adds later stay disabled until you enable them.",
  };
}
