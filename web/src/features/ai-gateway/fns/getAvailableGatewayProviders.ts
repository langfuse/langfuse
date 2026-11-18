import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** Providers a new gateway credential can use. */
export function getAvailableGatewayProviders() {
  return Object.keys(providerLabels) as GatewayProvider[];
}
