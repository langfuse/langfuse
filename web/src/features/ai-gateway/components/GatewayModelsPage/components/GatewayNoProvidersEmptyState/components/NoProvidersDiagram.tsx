import { GatewaySetupSwitchboard } from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { getGatewaySetupHeroProviders } from "@/src/features/ai-gateway/components/GatewayOverviewPage/fns/getGatewaySetupHeroProviders";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

export function NoProvidersDiagram({ addLabel }: { addLabel?: string }) {
  return (
    <GatewayPlaceholder.Diagram>
      <div className="mx-auto aspect-[440/200] w-full max-w-xl">
        <GatewaySetupSwitchboard
          providers={getGatewaySetupHeroProviders(new Set())}
          sources={GATEWAY_TRAFFIC_SOURCES}
          addLabel={addLabel}
          comingSoonLabel="More soon"
        />
      </div>
    </GatewayPlaceholder.Diagram>
  );
}
