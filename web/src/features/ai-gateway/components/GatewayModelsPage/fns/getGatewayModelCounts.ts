import type { GatewayModelCount } from "@/src/features/ai-gateway/components/GatewayModelsPage/types/gatewayModelCount";
import { isGatewayModelAllowed } from "@/src/features/ai-gateway/fns/isGatewayModelAllowed";
import { toGatewayAllowedModelsSet } from "@/src/features/ai-gateway/fns/toGatewayAllowedModelsSet";
import type { RouterOutputs } from "@/src/utils/api";

type ModelRefreshResult = RouterOutputs["aiGateway"]["refreshModels"][number];

/** Enabled and discovered model counts per connection; failed discoveries are left out. */
export function getGatewayModelCounts(
  results: ModelRefreshResult[],
  connections: ReadonlyArray<{ id: string; allowedModels: unknown }>,
): Record<string, GatewayModelCount> {
  const connectionsById = new Map(
    connections.map((connection) => [connection.id, connection]),
  );
  return Object.fromEntries(
    results.flatMap((result) => {
      const connection = connectionsById.get(result.connectionId);
      if (!result.success || !connection) return [];
      const allowedModels = toGatewayAllowedModelsSet(connection.allowedModels);
      if (result.catalogUnavailable) {
        return [
          [
            result.connectionId,
            { enabled: allowedModels === null ? "all" : allowedModels.size },
          ],
        ];
      }
      const enabled = result.models.filter((model) =>
        isGatewayModelAllowed(allowedModels, model),
      ).length;
      return [[result.connectionId, { enabled, total: result.models.length }]];
    }),
  );
}
