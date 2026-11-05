import { env } from "@/src/env.mjs";

export type GatewayPreReleaseEnvironment = {
  nodeEnv: string | undefined;
  cloudRegion?: string;
  previewPrUrl?: string;
};

const PRE_RELEASE_CLOUD_REGIONS = ["STAGING", "DEV"];

/**
 * Gateway features still in testing (Bedrock credentials, custom models) are
 * offered only in local development, PR previews, staging and dev.
 */
export function isGatewayPreReleaseEnvironment(
  environment: GatewayPreReleaseEnvironment = {
    nodeEnv: env.NODE_ENV,
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
  },
) {
  return (
    environment.nodeEnv === "development" ||
    environment.previewPrUrl !== undefined ||
    PRE_RELEASE_CLOUD_REGIONS.includes(environment.cloudRegion ?? "")
  );
}
