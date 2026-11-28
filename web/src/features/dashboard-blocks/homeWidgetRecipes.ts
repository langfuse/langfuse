import { type FilterState, HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import { type ViewVersion } from "@langfuse/shared/query";
import { traceViewQuery } from "@/src/features/dashboard/lib/dashboard-utils";
import {
  type HomeWidgetRecipeContext,
  type HomeWidgetRecipe,
  type RecipeSource,
  count,
  cost,
  tokens,
  mean,
  percentile,
  generationFilter,
  metric,
  source,
  tab,
  recipe,
  descending,
} from "./home-widget-recipes/recipe";
import { modelRecipe } from "./home-widget-recipes/modelUsage";
import { scoreTable, scoreAnalytics } from "./home-widget-recipes/scores";
export type { HomeWidgetRecipeContext } from "./home-widget-recipes/recipe";

function traces(
  version: ViewVersion,
  groupedByName: boolean,
  dimensions: string[] = [],
): RecipeSource {
  const spec = traceViewQuery({
    metricsVersion: version,
    globalFilterState: [],
    groupedByName,
  });
  const traceCount = spec.metrics[0]!;
  return source(
    "traces",
    "Traces",
    [metric("count", traceCount.measure, traceCount.aggregation, "Traces")],
    dimensions,
    spec.filters,
    spec.view === "traces" ? "traces" : "observations",
    dimensions.length
      ? descending(`${traceCount.aggregation}_${traceCount.measure}`)
      : undefined,
  );
}

function latencyTable(
  title: string,
  view: RecipeSource["view"],
  dimensions: string[],
  filters: FilterState,
): HomeWidgetRecipe {
  const metrics = (["p50", "p90", "p95", "p99"] as const).map(percentile);
  return recipe(title, "The top 20 groups ranked by p95 duration.", [
    tab(
      "latency",
      "Latency",
      "PIVOT_TABLE",
      source(
        "latency",
        "Latency",
        metrics,
        dimensions,
        filters,
        view,
        descending("p95_latency"),
      ),
      { rowLimit: 20, hideUnattributedRows: true },
    ),
  ]);
}

export function buildHomeWidgetRecipe(
  presetId: string,
  ctx: HomeWidgetRecipeContext,
): HomeWidgetRecipe {
  const preset = HOME_DASHBOARD_PRESET_IDS.find((id) => id === presetId);
  if (!preset) return { reason: "This Home card has no editable recipe." };
  switch (preset) {
    case "home-traces": {
      const byName = traces(ctx.version, true, [
        ctx.version === "v2" ? "traceName" : "name",
      ]);
      return recipe(
        "Traces",
        ctx.version === "v2"
          ? "Distinct trace IDs in observations, grouped by trace name."
          : "Trace records grouped by trace name.",
        [
          tab("names", "Top trace names", "HORIZONTAL_BAR", byName, {
            rowLimit: 20,
          }),
          tab("total", "Total traces", "NUMBER", traces(ctx.version, false)),
        ],
        [
          "The Total traces tab queries the whole population separately from the top 20 names.",
        ],
      );
    }
    case "home-model-costs":
      return recipe(
        "Model costs",
        "Generation-like observations grouped by model, ranked by cost. The subtotal covers the top 20 returned groups, including unattributed cost.",
        [
          tab(
            "models",
            "Models",
            "PIVOT_TABLE",
            source(
              "models",
              "Models",
              [cost, tokens],
              ["providedModelName"],
              generationFilter(),
              "observations",
              descending("sum_totalCost"),
            ),
            {
              rowLimit: 20,
              subtotalMetric: "models.cost",
              hideUnattributedRows: true,
            },
          ),
        ],
      );
    case "home-model-usage":
    case "home-generation-latency":
      return modelRecipe(preset, ctx);
    case "home-scores-table":
      return scoreTable(ctx);
    case "home-score-analytics":
      return scoreAnalytics(ctx);
    case "home-chart-scores":
      return recipe(
        "Scores over time",
        "Mean numeric or boolean score value per time bucket, grouped by name, data type and source. Uses score timestamps and all matching attachment targets.",
        [
          tab(
            "scores",
            "Mean score",
            "LINE_TIME_SERIES",
            source(
              "scores",
              "Mean score",
              [mean],
              ["name", "dataType", "source"],
              [],
              "scores-numeric",
            ),
          ),
        ],
      );
    case "home-traces-obs-time-series": {
      const tabs: MultiQueryTab[] = [];
      if (ctx.version === "v1")
        tabs.push(
          tab("traces", "Traces", "LINE_TIME_SERIES", traces("v1", false)),
        );
      tabs.push(
        tab(
          "observations",
          "Observations by level",
          "LINE_TIME_SERIES",
          source("observations", "Observations", [count], ["level"]),
        ),
      );
      const legacy = tabs.map((t) => t.id);
      if (ctx.version === "v1")
        tabs.push(
          tab("totalTraces", "Total traces", "NUMBER", traces("v1", false)),
        );
      tabs.push(
        tab(
          "totalObservations",
          "Total observations",
          "NUMBER",
          source("observations", "Observations", [count]),
        ),
      );
      return recipe(
        ctx.version === "v2"
          ? "Observations by time"
          : "Traces and observations by time",
        "Counts records within each dashboard time bucket.",
        tabs,
        ["The full-period totals are available in their own tabs."],
        ctx.activeTab,
        legacy,
      );
    }
    case "home-users": {
      const costByUser = source(
        "spend",
        "Cost",
        [cost],
        ["userId"],
        generationFilter(),
        "observations",
        descending("sum_totalCost"),
      );
      return recipe(
        "User consumption",
        "Each tab ranks its top 20 users. The subtotal sums only those returned groups.",
        [
          tab("cost", "Token cost", "HORIZONTAL_BAR", costByUser, {
            rowLimit: 20,
            subtotalMetric: "spend.cost",
          }),
          tab(
            "traces",
            "Count of traces",
            "HORIZONTAL_BAR",
            traces(ctx.version, false, ["userId"]),
            { rowLimit: 20, subtotalMetric: "traces.count" },
          ),
        ],
        [],
        ctx.activeTab,
      );
    }
    case "home-latency-table-traces":
      return ctx.version === "v1"
        ? latencyTable("Trace latency percentiles", "traces", ["name"], [])
        : latencyTable(
            "Root observation latency percentiles",
            "observations",
            ["traceName"],
            [
              {
                column: "isRootObservation",
                type: "boolean",
                operator: "=",
                value: true,
              },
            ],
          );
    case "home-latency-table-generations":
      return latencyTable(
        "Generation latency percentiles",
        "observations",
        ["name"],
        generationFilter(),
      );
    case "home-latency-table-observations":
      return latencyTable(
        "Observation latency percentiles",
        "observations",
        ["type", "name"],
        [
          {
            column: "type",
            type: "stringOptions",
            operator: "none of",
            value: ["GENERATION"],
          },
        ],
      );
  }
}
