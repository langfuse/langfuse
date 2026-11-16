export type GatewayDeploymentEnvironment = {
  nodeEnv: string | undefined;
  cloudRegion?: string;
  previewPrUrl?: string;
};

export function isDevelopmentOrPreview(
  environment: GatewayDeploymentEnvironment,
) {
  return (
    environment.nodeEnv === "development" ||
    environment.previewPrUrl !== undefined
  );
}
