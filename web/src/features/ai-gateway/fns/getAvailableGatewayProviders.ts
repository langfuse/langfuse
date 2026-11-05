import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayDeploymentEnvironment } from "@/src/features/ai-gateway/fns/isDevelopmentOrPreview";
import { isGatewayPreReleaseEnvironment } from "@/src/features/ai-gateway/fns/isGatewayPreReleaseEnvironment";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** Providers a new gateway credential can use; Bedrock is still pre-release. */
export function getAvailableGatewayProviders(
  environment?: GatewayDeploymentEnvironment,
) {
  const providers = Object.keys(providerLabels) as GatewayProvider[];
  if (isGatewayPreReleaseEnvironment(environment)) return providers;
  return providers.filter((provider) => provider !== "BEDROCK");
}
