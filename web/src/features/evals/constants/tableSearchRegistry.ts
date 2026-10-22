import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { evaluatorFilterConfig } from "@/src/features/filters/config/evaluators-config";
import { evalLogFilterConfig } from "@/src/features/filters/config/eval-logs-config";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

function facetColumns(config: FilterConfig) {
  const exposed = new Set(config.facets.map((facet) => facet.column));
  return config.columnDefinitions.filter((column) => exposed.has(column.id));
}

export const LEGACY_EVALUATORS_FIELD_REGISTRY = fieldRegistryFromColumns(
  facetColumns(evaluatorFilterConfig),
  {
    id: "legacyEvaluators",
    allowFreeText: true,
    freeTextScopeLabel: "score and rule names",
    searchExamples: ["quality", "status:ACTIVE", "target:EVENT"],
    recentSearches: true,
  },
);

export const EVAL_LOGS_FIELD_REGISTRY = fieldRegistryFromColumns(
  facetColumns(evalLogFilterConfig),
  {
    id: "evalLogs",
    allowFreeText: false,
    defaultTextField: "traceId",
    searchExamples: ["status:ERROR", "traceId:example-trace"],
    recentSearches: true,
  },
);
