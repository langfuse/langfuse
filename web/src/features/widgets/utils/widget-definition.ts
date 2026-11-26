import {
  toWidgetDefinition,
  type MultiQueryTab,
  type WidgetDefinition,
} from "@langfuse/shared/dashboards";
import {
  partitionStoredUiTableFiltersToView,
  partitionWidgetUiTableFiltersToView,
} from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";

export function toSavedWidgetEditorDefinition(
  widget: Parameters<typeof toWidgetDefinition>[0],
): WidgetDefinition {
  const definition = toWidgetDefinition(widget);
  if (definition.kind === "markdown") return definition;
  const normalizeSource = (source: MultiQueryTab["queries"][number]) => {
    const { mappedFilters, unsupportedFilters } = widget.definition
      ? partitionWidgetUiTableFiltersToView(source.view, source.filters)
      : partitionStoredUiTableFiltersToView(source.view, source.filters);
    return {
      ...source,
      filters: [...mappedFilters, ...unsupportedFilters],
    };
  };
  const config = definition.config;
  return {
    ...definition,
    config:
      config.version === 2
        ? {
            ...config,
            tabs: config.tabs.map((tab) => ({
              ...tab,
              queries: tab.queries.map(normalizeSource),
            })),
          }
        : { ...config, queries: config.queries.map(normalizeSource) },
  };
}
