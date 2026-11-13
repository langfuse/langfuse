import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import type { GatewayModelAccessState } from "@/src/features/ai-gateway/components/GatewayConnectionModelsPage/types/gatewayModelAccessStore";

export function isGatewayModelEnabled(
  state: Pick<GatewayModelAccessState, "allowedModels" | "optimisticEnabled">,
  model: string,
) {
  return (
    state.optimisticEnabled[model] ??
    isGatewayModelAllowed(state.allowedModels, model)
  );
}
