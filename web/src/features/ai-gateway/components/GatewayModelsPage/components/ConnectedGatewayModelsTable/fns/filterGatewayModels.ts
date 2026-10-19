import type { aggregateModels } from "@/src/features/ai-gateway/components/GatewayModelsPage/fns/aggregateModels";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayModelRow = ReturnType<typeof aggregateModels>[number];

export function filterGatewayModels(
  models: GatewayModelRow[],
  searchQuery: string,
  provider: GatewayProvider | "all",
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return models.filter(
    (model) =>
      (normalizedSearch.length === 0 ||
        model.id.toLowerCase().includes(normalizedSearch)) &&
      (provider === "all" || model.provider === provider),
  );
}
