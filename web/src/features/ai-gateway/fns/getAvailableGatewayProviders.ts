import { env } from "@/src/env.mjs";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

type ProviderAvailabilityEnvironment = {
  nodeEnv: string | undefined;
  cloudRegion?: string;
  previewPrUrl?: string;
};

const PRE_RELEASE_CLOUD_REGIONS = ["STAGING", "DEV"];

/**
 * Providers a new gateway credential can use. Bedrock is still in testing, so
 * it is offered only in local development, PR previews, staging and dev.
 */
export function getAvailableGatewayProviders(
  environment: ProviderAvailabilityEnvironment = {
    nodeEnv: env.NODE_ENV,
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
  },
) {
  const providers = Object.keys(providerLabels) as GatewayProvider[];
  if (isPreReleaseEnvironment(environment)) return providers;
  return providers.filter((provider) => provider !== "BEDROCK");
}

function isPreReleaseEnvironment(environment: ProviderAvailabilityEnvironment) {
  return (
    environment.nodeEnv === "development" ||
    environment.previewPrUrl !== undefined ||
    PRE_RELEASE_CLOUD_REGIONS.includes(environment.cloudRegion ?? "")
  );
}
