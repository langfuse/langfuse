import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

type NoProvidersDiagramProps = Pick<
  GatewaySetupSwitchboardProps,
  "unconnectedVariant"
>;

export function NoProvidersDiagram({
  unconnectedVariant,
}: NoProvidersDiagramProps) {
  return (
    <GatewayPlaceholder.Diagram>
      <div className="mx-auto aspect-[440/200] w-full max-w-xl">
        <GatewaySetupSwitchboard
          providers={getGatewaySetupHeroProviders(new Set())}
          sources={GATEWAY_TRAFFIC_SOURCES}
          unconnectedVariant={unconnectedVariant}
          comingSoonLabel="More soon"
        />
      </div>
    </GatewayPlaceholder.Diagram>
  );
}
