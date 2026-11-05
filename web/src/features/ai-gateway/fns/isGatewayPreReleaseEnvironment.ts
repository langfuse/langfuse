import { env } from "@/src/env.mjs";
import {
  type GatewayDeploymentEnvironment,
  isDevelopmentOrPreview,
} from "@/src/features/ai-gateway/fns/isDevelopmentOrPreview";

const PRE_RELEASE_CLOUD_REGIONS = ["STAGING", "DEV"];

/**
 * Gateway features still in testing (Bedrock credentials, custom models) are
 * offered only in local development, PR previews, staging and dev.
 */
export function isGatewayPreReleaseEnvironment(
  environment: GatewayDeploymentEnvironment = {
    // `env.NODE_ENV` is server-only and throws in the browser; Next inlines this on both sides.
    nodeEnv: process.env.NODE_ENV,
    cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    previewPrUrl: env.NEXT_PUBLIC_PREVIEW_PR_URL,
  },
) {
  return (
    isDevelopmentOrPreview(environment) ||
    PRE_RELEASE_CLOUD_REGIONS.includes(environment.cloudRegion ?? "")
  );
}
