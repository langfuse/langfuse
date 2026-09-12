import { ListMonitorFilterSchema } from "@langfuse/shared/monitors";
import type { FilterConfig } from "@/src/features/filters";
import { fieldRegistryFromColumns } from "@/src/features/search-bar/lib/fields";

export function monitorsFieldRegistry(config: FilterConfig) {
  const facetColumns = new Set(config.facets.map((facet) => facet.column));
  return fieldRegistryFromColumns(
    config.columnDefinitions.filter((column) => facetColumns.has(column.id)),
    {
      id: "monitors",
      allowFreeText: false,
      filterStateErrors: (filters) => {
        if (
          new Set(filters.map((filter) => filter.column)).size !==
          filters.length
        ) {
          return [
            "Alerts support one filter per field. Combine values in one group, such as severity:(ALERT OR WARNING).",
          ];
        }
        return ListMonitorFilterSchema.safeParse(filters).success
          ? []
          : [
              "This filter is not supported by alerts. Use severity, tags or an available evaluator.",
            ];
      },
      recentSearches: true,
      searchExamples: ["severity:ALERT", "tags:production"],
      fields: {
        tags: { aliases: ["tag"] },
        evaluatorId: { aliases: ["evaluator", "evaluator_id"] },
      },
    },
  );
}
