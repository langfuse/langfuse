import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export function describeGatewayModelAccess(
  allowedModels: string[] | null,
  provider: GatewayProvider,
) {
  const providerLabel = providerLabels[provider];

  if (allowedModels === null) {
    return `Gateway keys can call every ${providerLabel} model, including models ${providerLabel} publishes in the future.`;
  }

  return `Gateway keys can call only the models you selected. Models ${providerLabel} publishes in the future stay off until you enable them here.`;
}
