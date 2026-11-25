import { Plus } from "@langfuse/icons";

import { Button } from "@/src/components/design-system/Button/Button";
import { GATEWAY_SETUP_DOCS_URL } from "@/src/features/ai-gateway/constants/gatewayDocsUrls";
import { GATEWAY_PROVIDER_OPTIONS } from "@/src/features/ai-gateway/constants/gatewayProviderOptions";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";
import { NoProvidersFrame } from "./components/NoProvidersFrame";
import { NoProvidersProviderList } from "./components/NoProvidersProviderList";
import { ProviderCard } from "./components/ProviderCard";

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
    <NoProvidersFrame
      description="Your agents and apps send requests through the gateway to the providers you connect. It routes them and discovers each provider's models."
      actions={
        <>
          <Button
            variant="outline"
            text="Setup guide"
            href={GATEWAY_SETUP_DOCS_URL}
          />
          <Button text="Add connection" icon={Plus} onClick={onAddProvider} />
        </>
      }
    >
      <NoProvidersProviderList>
        {GATEWAY_PROVIDER_OPTIONS.map(({ provider, hint }) => (
          <li key={provider}>
            <ProviderCard
              provider={provider}
              hint={hint}
              onConnect={() => onConnectProvider(provider)}
            />
          </li>
        ))}
      </NoProvidersProviderList>
    </NoProvidersFrame>
  );
}
