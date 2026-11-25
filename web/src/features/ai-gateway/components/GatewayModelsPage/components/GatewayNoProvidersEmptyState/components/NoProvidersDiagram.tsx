import { GatewayFanOutDiagram } from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/GatewayFanOutDiagram";
import diagramStyles from "@/src/features/ai-gateway/components/GatewayFanOutDiagram/gatewayFanOutDiagram.module.css";
import { GATEWAY_TRAFFIC_SOURCES } from "@/src/features/ai-gateway/constants/gatewayTrafficSources";
import { cn } from "@/src/utils/tailwind";

export function NoProvidersDiagram() {
  return (
    <div className={cn("w-full rounded-xl px-6 py-5", diagramStyles.panel)}>
      <GatewayFanOutDiagram sources={GATEWAY_TRAFFIC_SOURCES} />
    </div>
  );
}
