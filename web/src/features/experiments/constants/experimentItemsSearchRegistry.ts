import { experimentItemsFilterConfig } from "@/src/features/experiments/config/experiment-items-filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar";

const facetColumns = new Set(
  experimentItemsFilterConfig.facets.map((facet) => facet.column),
);

export const EXPERIMENT_ITEMS_FIELD_REGISTRY = fieldRegistryFromColumns(
  experimentItemsFilterConfig.columnDefinitions.filter((column) =>
    facetColumns.has(column.id),
  ),
  {
    id: "experimentItems",
    allowFreeText: false,
    metadata: { itemMetadata: "itemMetadata", eventMetadata: "eventMetadata" },
    scores: true,
    traceScores: false,
    recentSearches: true,
    searchExamples: ["level:ERROR", "scores.quality:>0.8"],
    fields: { level: { aliases: ["status"] } },
  },
);
