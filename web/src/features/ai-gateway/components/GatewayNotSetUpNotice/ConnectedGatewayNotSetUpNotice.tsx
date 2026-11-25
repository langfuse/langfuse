import { GatewayNotSetUpNotice } from "@/src/features/ai-gateway/components/GatewayNotSetUpNotice/GatewayNotSetUpNotice";
import { useQueryOrganization } from "@/src/features/organizations/hooks";

export function ConnectedGatewayNotSetUpNotice() {
  const organization = useQueryOrganization();

  return <GatewayNotSetUpNotice organizationName={organization?.name} />;
}
