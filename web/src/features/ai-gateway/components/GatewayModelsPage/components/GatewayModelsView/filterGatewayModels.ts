import type { FilterState } from "@langfuse/shared";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayModelRow = {
  id: string;
  availableVia: Array<{
    connectionId: string;
    connectionName: string;
    provider: GatewayProvider;
  }>;
  apiFormats: string[];
};

function getModelFilterValues(model: GatewayModelRow, column: string) {
  switch (column) {
    case "connection":
      return model.availableVia.map((connection) => connection.connectionId);
    case "provider":
      return model.availableVia.map((connection) => connection.provider);
    case "apiFormat":
      return model.apiFormats;
    default:
      return [];
  }
}

export function filterGatewayModels(
  models: GatewayModelRow[],
  searchQuery: string,
  filters: FilterState,
) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  return models.filter((model) => {
    if (
      normalizedSearch.length > 0 &&
      !model.id.toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }

    return filters.every((filter) => {
      const values = getModelFilterValues(model, filter.column);

      if (filter.type === "string") {
        const needle = filter.value.toLowerCase();
        const contains = values.some((value) =>
          value.toLowerCase().includes(needle),
        );
        return filter.operator === "does not contain" ? !contains : contains;
      }

      if (filter.type !== "arrayOptions" && filter.type !== "stringOptions") {
        return true;
      }

      const selected = filter.value;
      if (filter.operator === "none of") {
        return selected.every((value) => !values.includes(value));
      }
      if (filter.operator === "all of") {
        return selected.every((value) => values.includes(value));
      }
      return selected.some((value) => values.includes(value));
    });
  });
}
