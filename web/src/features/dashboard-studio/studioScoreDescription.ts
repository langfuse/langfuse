import { type StudioQuery, type StudioWidgetConfig } from "@langfuse/shared";

function selectedValue(
  query: StudioQuery,
  columns: string[],
  fallback: string,
) {
  const filter = query.filters.find((item) => columns.includes(item.column));
  if (!filter) return "";
  if (filter.operator !== "=" && filter.operator !== "any of") return fallback;
  if (typeof filter.value === "string") return filter.value;
  if (Array.isArray(filter.value)) return filter.value.join(", ");
  return fallback;
}
export function describeStudioScores(config: StudioWidgetConfig): string[] {
  return config.queries
    .filter(
      (query) =>
        query.view.startsWith("scores-") &&
        !query.hidden &&
        (!config.display.activeQueryIds?.length ||
          config.display.activeQueryIds.includes(query.id)),
    )
    .map((query) => {
      const definition =
        selectedValue(query, ["name", "scoreName"], "filtered definitions") ||
        query.label ||
        "Selected definition";
      const origin =
        selectedValue(query, ["source"], "filtered origins") || "all origins";
      let type = "numeric / boolean";
      if (query.view === "scores-boolean") type = "boolean";
      if (query.view === "scores-categorical") type = "categorical";
      const selectedType = selectedValue(query, ["dataType"], "");
      if (selectedType === "NUMERIC") type = "numeric";
      if (selectedType === "BOOLEAN") type = "boolean";
      const measures = query.metrics
        .map((metric) => {
          if (metric.aggregation === "count") return "score count";
          if (metric.aggregation === "avg")
            return type === "boolean" ? "pass rate" : "average score";
          if (metric.aggregation.startsWith("p"))
            return `p${metric.percentile ?? metric.aggregation.slice(1)} score`;
          return `${metric.aggregation} score`;
        })
        .join(", ");
      return `${definition} · ${origin} · ${type} · ${measures}`;
    });
}
