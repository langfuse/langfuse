import { observationEventsFilterConfig } from "@/src/features/events/config/filter-config";
import {
  omitFilterFacets,
  type FilterConfig,
} from "@/src/features/filters/lib/filter-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

export const agentsFilterConfig: FilterConfig = {
  ...omitFilterFacets(
    observationEventsFilterConfig,
    observationEventsFilterConfig.facets
      .map((facet) => facet.column)
      .filter((column) => column !== "environment"),
  ),
  tableName: "agents",
  defaultExpanded: ["environment"],
};

export const AGENTS_FIELD_REGISTRY = fieldRegistryFromColumns(
  agentsFilterConfig.columnDefinitions.filter(
    (column) => column.id === "environment",
  ),
  {
    id: "agents",
    metadata: false,
    scores: false,
    traceScores: false,
    allowFreeText: true,
    defaultSearchType: ["id"],
    freeTextScopeLabel: "agent names",
    recentSearches: true,
    aiFilterPrompt: false,
    searchExamples: ["research", "env:production", "-env:development"],
    fields: { environment: { aliases: ["env"] } },
  },
);
