import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

const NO_CONNECTED_PROVIDERS = new Set<never>();

export function ConnectedGatewayNotSetUpNotice() {
  const organization = useQueryOrganization();

  return (
    <GatewayNotSetUpNotice
      organizationName={organization?.name}
      providers={getGatewaySetupHeroProviders(NO_CONNECTED_PROVIDERS)}
    />
  );
}
