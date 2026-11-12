import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";
import type { RouterOutputs } from "@/src/utils/api";

/** Every discovered model the admin enabled, across the organization's provider connections. */
export function listGatewayEnabledModels(
  connections: RouterOutputs["aiGateway"]["listModelConnections"],
  results: RouterOutputs["aiGateway"]["refreshModels"],
): GatewayEnabledModel[] {
  return connections.flatMap((connection) => {
    const result = results.find(
      ({ connectionId }) => connectionId === connection.id,
    );
    if (!result?.success) return [];
    const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
    return result.models
      .filter((model) => isGatewayModelAllowed(allowedModels, model))
      .map((model) => ({
        slug: formatGatewayModelSlug(connection.name, model),
        model,
        provider: connection.provider,
      }));
  });
}
