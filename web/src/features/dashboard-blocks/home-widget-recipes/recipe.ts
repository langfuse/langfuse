import { type FilterState, getGenerationLikeTypes } from "@langfuse/shared";
import {
  type MultiQueryConfigV2,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { type ViewVersion } from "@langfuse/shared/query";

export type RecipeSource = MultiQueryTab["queries"][number];
type Metric = RecipeSource["metrics"][number];
type ChartType = MultiQueryTab["display"]["chartType"];

export type HomeWidgetRecipeContext = {
  version: ViewVersion;
  models?: string[];
  scores?: { name: string; source: string; dataType: string }[];
  activeTab?: string;
};

type ReadyRecipe = {
  config: MultiQueryConfigV2;
  initialTabId?: string;
  limitations: string[];
};
export type HomeWidgetRecipe = ReadyRecipe | { reason: string };

export const metric = (
  id: string,
  measure: string,
  aggregation: Metric["aggregation"],
  label: string,
): Metric => ({ id, measure, aggregation, label });
export const count = metric("count", "count", "count", "Count");
export const cost = metric("cost", "totalCost", "sum", "Cost");
export const tokens = metric("tokens", "totalTokens", "sum", "Tokens");
export const mean = metric("mean", "value", "avg", "Mean");
export const percentile = (p: "p50" | "p75" | "p90" | "p95" | "p99") =>
  metric(p, "latency", p, p);
export const generationFilter = (): FilterState => [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: getGenerationLikeTypes(),
  },
];
export function source(
  id: string,
  label: string,
  metrics: Metric[],
  dimensions: string[] = [],
  filters: FilterState = [],
  view: RecipeSource["view"] = "observations",
  orderBy?: RecipeSource["orderBy"],
): RecipeSource {
  return {
    id,
    label,
    view,
    metrics,
    dimensions: dimensions.map((field) => ({ field })),
    filters,
    orderBy,
  };
}
export const descending = (field: string): RecipeSource["orderBy"] => [
  { field, direction: "desc" },
];
export function tab(
  id: string,
  label: string,
  chartType: ChartType,
  query: RecipeSource,
  options: Partial<MultiQueryTab["display"]> = {},
): MultiQueryTab {
  return {
    id,
    label: label.slice(0, 200),
    queries: [query],
    display: {
      chartType,
      ...(chartType.endsWith("_TIME_SERIES")
        ? { timeBuckets: "dashboard" as const }
        : {}),
      ...options,
    },
  };
}
export function recipe(
  title: string,
  description: string,
  tabs: MultiQueryTab[],
  limitations: string[] = [],
  active?: string,
  legacyIds = tabs.map((tab) => tab.id),
): ReadyRecipe {
  const index = active && /^\d+$/.test(active) ? Number(active) : undefined;
  const requested = index === undefined ? active : legacyIds[index];
  const initialTabId = tabs.find(
    (tab) => tab.id === requested || tab.label === requested,
  )?.id;
  return {
    config: {
      version: 2,
      title,
      description,
      tabs: tabs.map((tab) => structuredClone(tab)),
    },
    limitations,
    initialTabId,
  };
}
