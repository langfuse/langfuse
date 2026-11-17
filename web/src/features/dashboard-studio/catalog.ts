import { type StudioWidgetConfig, type StudioQuery } from "@langfuse/shared";
import { getViewDeclaration } from "@langfuse/shared/query";

export const studioChartOptions = [
  { value: "VERTICAL_BAR", label: "Bar chart" },
  { value: "LINE_TIME_SERIES", label: "Line chart" },
  { value: "AREA_TIME_SERIES", label: "Area chart" },
  { value: "BAR_TIME_SERIES", label: "Bars over time" },
  { value: "HORIZONTAL_BAR", label: "Top list" },
  { value: "NUMBER", label: "Big number" },
  { value: "PIVOT_TABLE", label: "Table" },
  { value: "HISTOGRAM", label: "Histogram" },
  { value: "PIE", label: "Pie chart" },
] as const;

export const studioSourceOptions = [
  { value: "observations", label: "Observations" },
  { value: "traces", label: "Traces" },
  { value: "scores-numeric", label: "Numeric scores" },
  { value: "scores-boolean", label: "Boolean scores" },
  { value: "scores-categorical", label: "Categorical scores" },
] as const;

export function readableField(value: string) {
  const spaced = value.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getStudioSource(view: StudioQuery["view"], isV4: boolean) {
  return getViewDeclaration(view, isV4 ? "v2" : "v1");
}

export function createStudioQuery(id = "a"): StudioQuery {
  return {
    id,
    label: "Observations",
    view: "observations",
    metrics: [{ id: "count", measure: "count", aggregation: "count" }],
    dimensions: [],
    filters: [],
  };
}

export function createStudioWidget(): StudioWidgetConfig {
  return {
    version: 1,
    title: "What do you want to understand?",
    description: "",
    queries: [createStudioQuery()],
    expressions: [],
    display: {
      chartType: "VERTICAL_BAR",
      showHeadline: true,
      timeSeries: false,
      rowLimit: 100,
      legend: true,
    },
  };
}

export function createMetadataComparison(
  keys: [string, string],
): StudioWidgetConfig {
  const query = (id: string, key: string): StudioQuery => ({
    ...createStudioQuery(id),
    label: `Has ${key}`,
    filters: [
      {
        type: "stringObject",
        column: "metadata",
        key,
        operator: "is set",
        value: "",
      },
    ],
  });
  return {
    ...createStudioWidget(),
    title: "Which metadata is present?",
    description:
      "Each bar counts its own population. An observation with both keys is counted in both bars.",
    queries: [query("a", keys[0]), query("b", keys[1])],
    display: {
      chartType: "VERTICAL_BAR",
      timeSeries: false,
      legend: true,
      rowLimit: 100,
    },
  };
}
