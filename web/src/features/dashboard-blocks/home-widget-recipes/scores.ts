import { type FilterState } from "@langfuse/shared";
import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import {
  type HomeWidgetRecipeContext,
  type HomeWidgetRecipe,
  count,
  descending,
  mean,
  metric,
  recipe,
  source,
  tab,
} from "./recipe";

const exact = (column: string, value: string): FilterState[number] => ({
  column,
  type: "string",
  operator: "=",
  value,
});

export function scoreTable(ctx: HomeWidgetRecipeContext): HomeWidgetRecipe {
  const dimensions = ["name", "source", "dataType"];
  const recordCount =
    ctx.version === "v2" ? metric("count", "count", "sum", "Count") : count;
  const rank = descending(recordCount.aggregation + "_count");
  const legacy = ctx.version === "v1";
  const numericTypes = ["NUMERIC", "BOOLEAN"];
  const dataTypes = (
    values: string[],
    operator: "any of" | "none of" = "any of",
  ): FilterState[number] => ({
    column: "dataType",
    type: "stringOptions",
    operator,
    value: values,
  });
  const numericFilters = legacy ? [dataTypes(numericTypes)] : [];
  const valueCounts = (value: 0 | 1) => {
    const label = `Value equals ${value}`;
    return source(
      value === 0 ? "zeros" : "ones",
      label,
      [{ ...recordCount, label }],
      dimensions,
      [
        ...numericFilters,
        { column: "value", type: "number", operator: "=", value },
      ],
      "scores-numeric",
      rank,
    );
  };
  const numeric = tab(
    "definitions",
    "Numeric and boolean",
    "PIVOT_TABLE",
    source(
      "scores",
      "Scores",
      [recordCount, mean],
      dimensions,
      numericFilters,
      "scores-numeric",
      rank,
    ),
    { rowLimit: 1000 },
  );
  numeric.queries.push(valueCounts(0), valueCounts(1));
  const totals = tab(
    "total",
    "Total scores",
    "NUMBER",
    source(
      "numeric",
      legacy ? "All score records" : "Numeric and boolean scores",
      [recordCount],
      [],
      [],
      "scores-numeric",
    ),
  );
  if (!legacy) {
    totals.queries[0]!.hidden = true;
    totals.queries.push({
      ...source(
        "categorical",
        "Categorical scores",
        [recordCount],
        [],
        [],
        "scores-categorical",
      ),
      hidden: true,
    });
    totals.formulas = [
      {
        id: "total",
        label: "Total scores",
        expression: "numeric.count + categorical.count",
        format: "number",
      },
    ];
  }
  const limitations = [
    "The numeric and boolean table includes the count, mean and counts of values equal to 0 and 1. A dash means a query reached its 1,000-group limit and the count for that score is unknown. Categorical counts and the full-period total have their own tabs.",
  ];
  const tabs = [
    numeric,
    tab(
      "categorical",
      "Categorical",
      "PIVOT_TABLE",
      source(
        "scores",
        "Scores",
        [recordCount],
        dimensions,
        legacy ? [dataTypes(["CATEGORICAL"])] : [],
        legacy ? "scores-numeric" : "scores-categorical",
        rank,
      ),
      { rowLimit: 1000 },
    ),
  ];
  if (legacy) {
    limitations.push(
      "Other score types includes v3 text and correction records. Total scores counts every type returned by Home, including scores attached to earlier traces that match a trace filter.",
    );
    tabs.push(
      tab(
        "other",
        "Other score types",
        "PIVOT_TABLE",
        source(
          "other",
          "Other score records",
          [recordCount],
          dimensions,
          [dataTypes([...numericTypes, "CATEGORICAL"], "none of")],
          "scores-numeric",
          rank,
        ),
        { rowLimit: 1000 },
      ),
    );
  }
  tabs.push(totals);
  if (legacy)
    for (const chart of tabs)
      for (const series of chart.queries) series.homeScoreAggregate = true;
  return recipe(
    "Scores",
    "Counts score records by score timestamp, name, source and data type across attachment targets. A trace filter can narrow the score population.",
    tabs,
    limitations,
  );
}
export function scoreAnalytics(ctx: HomeWidgetRecipeContext): HomeWidgetRecipe {
  const selected = ctx.scores ?? [];
  const supported = selected.filter((s) =>
    ["NUMERIC", "BOOLEAN", "CATEGORICAL"].includes(s.dataType),
  );
  if (!supported.length)
    return {
      reason:
        "Select a numeric, boolean or categorical score on the Home card to create its distribution and trend.",
    };
  if (supported.length > 4)
    return {
      reason:
        "Select up to four score definitions. Each needs two chart tabs to preserve its distribution and trend.",
    };
  const tabs: MultiQueryTab[] = [];
  for (const [index, score] of supported.entries()) {
    const filters = [
      exact("name", score.name),
      exact("source", score.source),
      exact("dataType", score.dataType),
    ];
    const repeated = supported.some(
      (other, i) => i !== index && other.name === score.name,
    );
    const suffix = repeated
      ? ` · ${score.source} · ${score.dataType.toLowerCase()}`
      : "";
    const population = score.name.slice(0, 175 - suffix.length) + suffix;
    const categorical = score.dataType === "CATEGORICAL";
    const view = categorical ? "scores-categorical" : "scores-numeric";
    const prefix = "score" + (index + 1);
    tabs.push(
      tab(
        prefix + "Distribution",
        population + " · Distribution",
        categorical ? "VERTICAL_BAR" : "HISTOGRAM",
        source(
          "scores",
          "Distribution",
          categorical
            ? [count]
            : [metric("value", "value", "histogram", "Distribution")],
          categorical ? ["name", "stringValue"] : [],
          filters,
          view,
        ),
        categorical ? { rowLimit: 1000 } : { bins: 10 },
      ),
    );
    tabs.push(
      tab(
        prefix + "Trend",
        population + " · Trend",
        categorical ? "BAR_TIME_SERIES" : "LINE_TIME_SERIES",
        source(
          "scores",
          "Trend",
          categorical ? [count] : [mean],
          categorical ? ["name", "stringValue"] : ["name"],
          filters,
          view,
        ),
      ),
    );
  }
  const limitations = [
    "Each selected score becomes a distribution tab and a trend tab, with its name, source and data type saved as filters.",
  ];
  if (
    ctx.version === "v1" &&
    supported.some((s) => s.dataType !== "CATEGORICAL")
  )
    limitations.push(
      "The Home histogram samples up to 10,000 score values. The editable histogram aggregates all matching scores and applies trace filters to traces in the selected date range. Bins and counts can differ, especially for scores attached to earlier traces.",
    );
  if (supported.length !== selected.length)
    limitations.push(
      "Selected score types without a numeric, boolean or categorical chart are omitted.",
    );
  return recipe(
    "Score analytics",
    "Distributions and trends use each score's own timestamp. Numeric and boolean trends show the mean in each time bucket.",
    tabs,
    limitations,
  );
}
