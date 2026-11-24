import { BookOpen } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { TileCard } from "@/src/components/TileCard/TileCard";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PROVIDER_OPTIONS } from "@/src/features/ai-gateway/constants/gatewayProviderOptions";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { NoProvidersFrame } from "./components/NoProvidersFrame";
import { NoProvidersProviderList } from "./components/NoProvidersProviderList";
import { ProviderLogoTile } from "./components/ProviderLogoTile";

/** Shown to members who cannot add provider credentials. */
export function GatewayNoProvidersReadOnlyEmptyState() {
  return (
    <NoProvidersFrame
      description="Ask your organization admin to add a connection so the gateway can route requests."
      actions={
        <Button
          variant="outline"
          text="About gateway models"
          icon={BookOpen}
          href={GATEWAY_MODELS_DOCS_URL}
          hideExternalIcon
        />
      }
    >
      <NoProvidersProviderList>
        {GATEWAY_PROVIDER_OPTIONS.map(({ provider, hint }) => (
          <li key={provider}>
            <TileCard
              size="md"
              tile={<ProviderLogoTile provider={provider} />}
              title={providerLabels[provider]}
              description={hint}
            />
          </li>
        ))}
      </NoProvidersProviderList>
    </NoProvidersFrame>
  );
}
