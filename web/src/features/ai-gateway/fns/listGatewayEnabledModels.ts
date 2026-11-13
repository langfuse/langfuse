import { formatGatewayModelSlug } from "@/src/features/ai-gateway/fns/formatGatewayModelSlug";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type { GatewayEnabledModels } from "@/src/features/ai-gateway/types/gatewayEnabledModels";
import type { RouterOutputs } from "@/src/utils/api";

/** Every discovered model the admin enabled, across the organization's provider connections. */
export function listGatewayEnabledModels(
  connections: RouterOutputs["aiGateway"]["listModelConnections"],
  results: RouterOutputs["aiGateway"]["refreshModels"],
): GatewayEnabledModels {
  const catalogs = connections.map((connection) => {
    const result = results.find(
      ({ connectionId }) => connectionId === connection.id,
    );
    const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
    // Without the catalog, an allowlist that allows everything names no models.
    const isCatalogUnknown =
      !result?.success ||
      (Boolean(result.catalogUnavailable) && allowedModels === null);
    const models =
      result?.success && !isCatalogUnknown
        ? result.models
            .filter((model) => isGatewayModelAllowed(allowedModels, model))
            .map((model) => ({
              slug: formatGatewayModelSlug(connection.name, model),
              model,
              provider: connection.provider,
            }))
        : [];
    return { name: connection.name, isCatalogUnknown, models };
  });

  return {
    models: catalogs.flatMap(({ models }) => models),
    connections: catalogs.map(({ name, isCatalogUnknown }) => ({
      name,
      isCatalogUnknown,
    })),
  };
}
