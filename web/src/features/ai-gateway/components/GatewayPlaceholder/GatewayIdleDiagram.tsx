import {
  GatewaySetupSwitchboard,
  type GatewaySetupSwitchboardProps,
} from "@/src/features/ai-gateway/components/GatewayOverviewPage/components/GatewaySetupHero/GatewaySetupSwitchboard";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

/** The switchboard faded out, with `label` under the hub instead of traffic. */
export function GatewayIdleDiagram({
  providers,
  label,
}: {
  providers: GatewaySetupSwitchboardProps["providers"];
  label: string;
}) {
  return (
    <GatewayPlaceholder.Diagram>
      <div className="mx-auto aspect-[440/200] w-full max-w-xl opacity-50 grayscale">
        <GatewaySetupSwitchboard
          providers={providers}
          sources={GATEWAY_TRAFFIC_SOURCES}
          idleLabel={label}
        />
      </div>
    </GatewayPlaceholder.Diagram>
  );
}
