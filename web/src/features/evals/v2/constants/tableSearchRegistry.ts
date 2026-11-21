import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { FilterState } from "@langfuse/shared";
import {
  fieldRegistryFromColumns,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";
import {
  evaluatorTableFilterConfig,
  evaluatorTableFilterOptions,
} from "./tableFilterColumns";

function facetColumns(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return config.columnDefinitions.filter((column) => exposed.has(column.id));
}

const NAME_AND_CREATOR_FIELDS = {
  name: { syncMode: "textSearch", suggestObservedValues: true },
  creator: { syncMode: "textSearch", suggestObservedValues: true },
} as const;

function presenceFilterErrors(filters: FilterState): string[] {
  return filters.some((filter) => filter.type === "null")
    ? [
        "This list does not support presence filters. Enter a field value instead.",
      ]
    : [];
}

const evaluatorsRegistry = fieldRegistryFromColumns(
  facetColumns(evaluatorTableFilterConfig),
  {
    id: "evaluatorsList",
    filterStateErrors: presenceFilterErrors,
    fields: {
      ...NAME_AND_CREATOR_FIELDS,
      status: { filterColumn: "status" },
      type: { filterColumn: "type" },
      model: { syncMode: "textSearch", suggestObservedValues: true },
    },
    allowFreeText: true,
    freeTextScopeLabel: "evaluator names",
    searchExamples: ["quality", "status:ACTIVE", "type:CODE"],
    recentSearches: true,
  },
);

// Status and type are closed enums in the list API. Keep their canonical values
// in query text while using the same adapter gate as other labeled options.
export const EVALUATORS_LIST_FIELD_REGISTRY = withFieldOptions(
  withFieldOptions(
    evaluatorsRegistry,
    "status",
    evaluatorTableFilterOptions.status.map(({ value }) => ({ value })),
  ),
  "type",
  evaluatorTableFilterOptions.type.map(({ value }) => ({ value })),
);

export function evaluationRulesListFieldRegistry(config: FilterConfig) {
  return fieldRegistryFromColumns(facetColumns(config), {
    id: "evaluationRulesList",
    filterStateErrors: presenceFilterErrors,
    fields: NAME_AND_CREATOR_FIELDS,
    allowFreeText: true,
    freeTextScopeLabel: "rule names",
    searchExamples: ["quality", "enabled:true", "creator:API"],
    recentSearches: true,
  });
}
