import { providerColorIcons } from "@/src/features/ai-gateway/constants/providerColorIcons";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

type ProviderLogoTileProps = {
  provider: GatewayProvider;
};

export function ProviderLogoTile({ provider }: ProviderLogoTileProps) {
  const Logo = providerColorIcons[provider];

  return (
    <span
      aria-hidden="true"
      className="bg-surface-sunken text-foreground flex size-11 shrink-0 items-center justify-center rounded-lg border"
    >
      <Logo size="lg" />
    </span>
  );
}
