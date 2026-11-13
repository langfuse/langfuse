import type { GatewayModelCount } from "@/src/features/ai-gateway/components/GatewayModelsPage/types/gatewayModelCount";
import type { GatewayConnection } from "@/src/features/ai-gateway/types/gatewayProvider";

export function describeGatewayModelCount(
  modelCount: GatewayModelCount | "loading" | undefined,
  status: GatewayConnection["status"] | undefined,
) {
  if (status === "ERROR") return "API key rejected";
  if (modelCount === "loading") return "Loading…";
  if (modelCount === undefined) return "—";
  if (modelCount.enabled === "all") return "All models enabled";
  if (modelCount.total === undefined) return `${modelCount.enabled} enabled`;
  return `${modelCount.enabled} of ${modelCount.total} enabled`;
}
