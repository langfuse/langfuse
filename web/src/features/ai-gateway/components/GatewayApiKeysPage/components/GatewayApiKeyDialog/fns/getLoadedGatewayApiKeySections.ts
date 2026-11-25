import {
  gatewayApiKeySections,
  type GatewayApiKeyFormValues,
  type GatewayApiKeySection,
} from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeyDialog/types/gatewayApiKeyFormSchema";

/** The sections a loaded key has values for, in the default order. */
export function getLoadedGatewayApiKeySections(
  values: Omit<GatewayApiKeyFormValues, "sections">,
): GatewayApiKeySection[] {
  const isSet: Record<GatewayApiKeySection, boolean> = {
    expiration: values.expiryPreset !== "never",
    spendBudget: values.spendBudget.limitUsd !== "",
    models: values.modelPatterns.length > 0,
    metadata: values.metadata.length > 0,
  };
  return gatewayApiKeySections.filter((section) => isSet[section]);
}
