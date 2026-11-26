import { Button } from "@/src/components/design-system/Button/Button";
import { GATEWAY_MODELS_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PROVIDER_OPTIONS } from "@/src/features/ai-gateway/constants/gatewayProviderOptions";
import { NoProvidersFrame } from "./components/NoProvidersFrame";
import { NoProvidersProviderList } from "./components/NoProvidersProviderList";
import { ProviderCard } from "./components/ProviderCard";

/** Shown to members who cannot add provider credentials. */
export function GatewayNoProvidersReadOnlyEmptyState() {
  return (
    <NoProvidersFrame
      description="Ask your organization admin to add a connection so the gateway can route requests."
      actions={
        <Button
          variant="outline"
          text="About gateway models"
          href={GATEWAY_MODELS_DOCS_URL}
        />
      }
    >
      <NoProvidersProviderList>
        {GATEWAY_PROVIDER_OPTIONS.map(({ provider, hint }) => (
          <li key={provider}>
            <ProviderCard provider={provider} hint={hint} />
          </li>
        ))}
      </NoProvidersProviderList>
    </NoProvidersFrame>
  );
}
