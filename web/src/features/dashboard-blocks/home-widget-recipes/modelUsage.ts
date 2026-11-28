import { type FilterState } from "@langfuse/shared";
import {
  type HomeWidgetRecipeContext,
  type HomeWidgetRecipe,
  cost,
  tokens,
  percentile,
  generationFilter,
  metric,
  source,
  tab,
  recipe,
} from "./recipe";

export function modelRecipe(
  id: "home-model-usage" | "home-generation-latency",
  ctx: HomeWidgetRecipeContext,
): HomeWidgetRecipe {
  if (!ctx.models?.length)
    return {
      reason:
        "Select at least one model on the Home card to keep its population in the editable widget.",
    };
  const filters: FilterState = [
    ...generationFilter(),
    {
      column: "providedModelName",
      type: "stringOptions",
      operator: "any of",
      value: [...ctx.models],
    },
  ];
  const snapshot =
    "The selected models become saved filters. Update the filters in the widget editor when the model list changes.";
  if (id === "home-generation-latency") {
    const percentiles = ["p50", "p75", "p90", "p95", "p99"] as const;
    return recipe(
      "Model latencies",
      "Generation duration by model and time bucket.",
      percentiles.map((p) =>
        tab(
          p,
          p,
          "LINE_TIME_SERIES",
          source(
            "latency",
            "Generation latency",
            [percentile(p)],
            ["providedModelName"],
            filters,
          ),
        ),
      ),
      [snapshot],
      ctx.activeTab,
    );
  }
  const tabs = [
    tab(
      "costByModel",
      "Cost by model",
      "LINE_TIME_SERIES",
      source("cost", "Cost", [cost], ["providedModelName"], filters),
    ),
  ];
  const category = (
    id: string,
    label: string,
    measure: string,
    dimension: string,
  ) => {
    return tab(
      id,
      label,
      "LINE_TIME_SERIES",
      {
        ...source(
          id,
          label,
          [metric("value", measure, "sum", label)],
          [dimension],
          filters,
        ),
      },
      { timeBuckets: "auto" },
    );
  };
  tabs.push(category("costByType", "Cost by type", "costByType", "costType"));
  tabs.push(
    tab(
      "usageByModel",
      "Usage by model",
      "LINE_TIME_SERIES",
      source("tokens", "Usage", [tokens], ["providedModelName"], filters),
    ),
  );
  tabs.push(
    category("usageByType", "Usage by type", "usageByType", "usageType"),
  );
  tabs.push(
    tab(
      "totalCost",
      "Total cost",
      "NUMBER",
      source("cost", "Cost", [cost], [], filters),
    ),
    tab(
      "totalTokens",
      "Total usage",
      "NUMBER",
      source("tokens", "Tokens", [tokens], [], filters),
    ),
  );
  const limitations = [
    snapshot,
    "Cost and usage totals each have a tab covering the selected models and the full dashboard time range.",
  ];
  if (ctx.version === "v1")
    limitations.push(
      "On v3, the category tabs support the Home time series and filters.",
    );
  return recipe(
    "Model usage",
    "Cost and token usage for the selected generation-like observations.",
    tabs,
    limitations,
    ctx.activeTab,
    ["costByModel", "costByType", "usageByModel", "usageByType"],
  );
}
