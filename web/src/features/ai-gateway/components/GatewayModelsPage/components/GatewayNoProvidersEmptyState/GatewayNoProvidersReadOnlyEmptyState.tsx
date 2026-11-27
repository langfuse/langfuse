import { GatewayCatalogEmptyState } from "@/src/features/ai-gateway/components/GatewayCatalogEmptyState/GatewayCatalogEmptyState";
import { NoProvidersDiagram } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/components/NoProvidersDiagram";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PROVIDER_OPTIONS } from "@/src/features/ai-gateway/constants/gatewayProviderOptions";
import { providerColorIcons } from "@/src/features/ai-gateway/constants/providerColorIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";

/** Shown to members who cannot add provider credentials. */
export function GatewayNoProvidersReadOnlyEmptyState() {
  return (
    <GatewayCatalogEmptyState
      title="No connections yet"
      description="Ask your organization admin to add a connection so the gateway can route requests."
      actions={[
        {
          variant: "outline",
          text: "About gateway models",
          href: GATEWAY_MODELS_DOCS_URL,
        },
      ]}
      optionsHeading="Connections"
      options={GATEWAY_PROVIDER_OPTIONS.map(({ provider, hint }) => ({
        id: provider,
        title: providerLabels[provider],
        hint,
        icon: providerColorIcons[provider],
      }))}
    >
      <NoProvidersDiagram />
    </GatewayCatalogEmptyState>
  );
}
