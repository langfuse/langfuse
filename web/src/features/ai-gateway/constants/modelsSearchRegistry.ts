import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";
import { gatewayModelsFilterConfig } from "./modelsFilterConfig";

const facetColumns = new Set(
  gatewayModelsFilterConfig.facets.map((facet) => facet.column),
);

export const GATEWAY_MODELS_FIELD_REGISTRY = fieldRegistryFromColumns(
  gatewayModelsFilterConfig.columnDefinitions.filter((column) =>
    facetColumns.has(column.id),
  ),
  {
    id: "gatewayModels",
    allowFreeText: true,
    filterStateErrors: (filters) =>
      filters.some((filter) => filter.type === "null")
        ? [
            "Gateway models do not support presence filters. Select a provider or API format instead.",
          ]
        : [],
    freeTextScopeLabel: "model names",
    searchExamples: ["provider:OPENAI", 'apiFormat:"Anthropic Messages"'],
  },
);
