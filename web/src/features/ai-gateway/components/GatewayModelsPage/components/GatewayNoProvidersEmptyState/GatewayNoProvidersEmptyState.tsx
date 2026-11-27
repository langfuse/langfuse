import { Plus } from "@langfuse/icons";

import { GatewayCatalogEmptyState } from "@/src/features/ai-gateway/components/GatewayCatalogEmptyState/GatewayCatalogEmptyState";
import { NoProvidersDiagram } from "@/src/features/ai-gateway/components/GatewayModelsPage/components/GatewayNoProvidersEmptyState/components/NoProvidersDiagram";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PROVIDER_OPTIONS } from "@/src/features/ai-gateway/constants/gatewayProviderOptions";
import { providerColorIcons } from "@/src/features/ai-gateway/constants/providerColorIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayNoProvidersEmptyStateProps = {
  onAddProvider: () => void;
  onConnectProvider: (provider: GatewayProvider) => void;
};

/** Shown to gateway managers until the organization has a provider credential. */
export function GatewayNoProvidersEmptyState({
  onAddProvider,
  onConnectProvider,
}: GatewayNoProvidersEmptyStateProps) {
  return (
    <GatewayCatalogEmptyState
      title="No connections yet"
      description="Your agents and apps send requests through the gateway to the providers you connect. It routes them and discovers each provider's models."
      actions={[
        {
          variant: "outline",
          text: "Setup guide",
          href: GATEWAY_SETUP_DOCS_URL,
        },
        {
          text: "Add connection",
          icon: Plus,
          onClick: onAddProvider,
        },
      ]}
      optionsHeading="Connections"
      options={GATEWAY_PROVIDER_OPTIONS.map(({ provider, hint }) => ({
        id: provider,
        title: providerLabels[provider],
        hint,
        icon: providerColorIcons[provider],
        actionLabel: "Connect",
        onSelect: () => onConnectProvider(provider),
      }))}
    >
      <NoProvidersDiagram />
    </GatewayCatalogEmptyState>
  );
}
