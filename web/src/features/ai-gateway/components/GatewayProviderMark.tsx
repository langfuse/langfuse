import { providerIcons } from "@/src/features/ai-gateway/constants/providerIcons";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayProviderMarkProps = {
  provider: GatewayProvider;
};

export function GatewayProviderMark({ provider }: GatewayProviderMarkProps) {
  const ProviderIcon = providerIcons[provider];

  return (
    <span
      aria-hidden="true"
      className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-md border"
      title={providerLabels[provider]}
    >
      <ProviderIcon size="base" />
    </span>
  );
}
