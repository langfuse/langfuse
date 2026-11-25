import { GatewayFanOutDiagram } from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/GatewayFanOutDiagram";
import { GatewayPlaceholder } from "@/src/features/ai-gateway/components/GatewayPlaceholder/GatewayPlaceholder";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";

/** The gateway fan-out diagram in the placeholder panel. */
export function GatewayTrafficDiagram() {
  return (
    <GatewayPlaceholder.Diagram>
      <GatewayFanOutDiagram sources={GATEWAY_TRAFFIC_SOURCES} />
    </GatewayPlaceholder.Diagram>
  );
}
