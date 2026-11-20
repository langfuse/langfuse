import {
  type StudioQuery,
  type StudioWidgetConfig,
} from "../../../src/domain/dashboard-studio";
import { HOME_DASHBOARD_PRESET_IDS } from "../../../src/domain/home-dashboard";
import {
  DashboardDefinitionSchema,
  type DashboardDefinition,
} from "../../../src/server/services/DashboardService/types";
import type { FilterState } from "../../../src/types";

import { createNotebook, notebookExample } from "./dashboard-notebook";

export function buildDashboardResearchReport(
  story: DashboardDefinition,
  learningHref?: string,
) {
  const { widgets, geometry, note, chapter, chart } = createNotebook();
  const example = (id: string) => notebookExample(story, id);
  const options = (column: string, value: string): FilterState[number] => ({
    column,
    type: "stringOptions",
    operator: "any of",
    value: [value],
  });
  const count = {
    id: "count",
    measure: "count",
    aggregation: "count",
  } as const;
  const observation = (id: string, label: string): StudioQuery => ({
    id,
    label,
    view: "observations",
    metrics: [count],
    filters: [],
    dimensions: [],
  });
  const current = (
    title: string,
    description: string,
    queries: StudioQuery[],
    chartType: StudioWidgetConfig["display"]["chartType"],
    unit?: string,
  ): StudioWidgetConfig => ({
    version: 1,
    executionMode: "current",
    title,
    description,
    queries,
    expressions: [],
    display: {
      chartType,
      unit,
      timeSeries: chartType.endsWith("TIME_SERIES"),
      rowLimit: 100,
      legend: true,
    },
  });

  chapter(
    "existing",
    "Questions we can answer today",
    "A team operates three workloads and wants to understand its bill. Each output below runs on the existing dashboard query endpoint. Edit a chart to inspect its inputs or change the question.",
  );
  chart(
    "workload_cost",
    current(
      "Where do we spend the most?",
      "Total recorded observation cost for each selected workload over the report period.",
      ["support", "search", "coding"].map((workload) => ({
        ...observation(
          workload,
          workload.charAt(0).toUpperCase() + workload.slice(1),
        ),
        filters: [
          {
            type: "stringObject",
            column: "metadata",
            key: "workload",
            operator: "=",
            value: workload,
          },
        ],
        metrics: [{ id: "cost", measure: "totalCost", aggregation: "sum" }],
      })),
      "VERTICAL_BAR",
      "USD",
    ),
  );
  note(
    "read_spend",
    "Reading the comparison",
    "In the full fixture, Search accounts for most spend. Coding still has observations and records zero cost. Each bar asks for the sum of cost where `metadata.workload` equals one chosen value. A zero means that workload contributed no recorded cost in this window. A fourth workload only appears when someone adds it. Automatically finding the largest spenders is a separate question in **The query builder**.",
  );
  chart("presence", {
    ...example("presence"),
    executionMode: "current",
    title: "How many observations carry each key?",
    description:
      "Two independent counts. An observation with both keys contributes to both bars, including when a stored value is empty.",
    display: { ...example("presence").display, showHeadline: false },
  });
  chart(
    "pulse_latency",
    current(
      "How far apart are typical and slow requests?",
      "Median and 95th-percentile observation duration per time bucket, as in Tracing Pulse. Both metrics share one source query.",
      [
        {
          ...observation("latency", "Duration"),
          metrics: [
            {
              id: "median",
              label: "Median",
              measure: "latency",
              aggregation: "p50",
            },
            {
              id: "tail",
              label: "95th percentile",
              measure: "latency",
              aggregation: "p95",
            },
          ],
        },
      ],
      "LINE_TIME_SERIES",
      "milliseconds",
    ),
  );
  note(
    "pulse_decision",
    "From Pulse to a saved chart",
    "Tracing Pulse already combines count, cost and latency measures. Here the two duration measures share an axis and unit. The time picker sets the population for all cells. Grouping into time buckets is a separate chart choice.\n\n**Decision for the first release.** Try a limit of five independent source queries. A grouped chart can also need one ungrouped request per source for period totals. On a separate local fixture with 999,000 observations, five prototype queries read 5.08 million rows and 682 MB. Measure this on representative projects before setting the production limit.",
  );

  chapter(
    "scores",
    "What changed in our scores?",
    "Start with a score definition and a unit of analysis. The examples below use three definitions from the same application. Each input row represents one evaluation, and time means when the score was recorded.",
  );
  const score = (
    id: string,
    name: string,
    view: StudioQuery["view"],
    metrics: StudioQuery["metrics"],
  ): StudioQuery => ({
    id,
    label: name,
    view,
    metrics,
    dimensions: [],
    filters: [
      options("name", name),
      options("source", "API"),
      options("dataType", view.slice("scores-".length).toUpperCase()),
    ],
  });
  const quality = score("quality", "quality", "scores-numeric", [
    { id: "mean", measure: "value", aggregation: "avg", label: "Mean quality" },
  ]);
  chart(
    "quality_trend",
    current(
      "How has average quality changed?",
      "Each point averages the 0–1 evaluations in that bucket. Hover or open Data to see how many contributed.",
      [quality],
      "LINE_TIME_SERIES",
    ),
  );
  chart(
    "quality_samples",
    current(
      "How many evaluations support each point?",
      "Same score definition, source and time window as the quality trend. Multiple evaluations can belong to one trace.",
      [{ ...quality, metrics: [{ ...count, label: "Evaluations" }] }],
      "BAR_TIME_SERIES",
    ),
  );
  note(
    "score_reading",
    "Interpreting the last point",
    "This fixture includes evaluations that arrive after the original request. The last bucket is partial. A late run can raise its mean and increase its sample count, even when the application itself is unchanged. Open **Data** to read a bucket. For a quality alert, choose the evaluation window and minimum sample count together.",
  );
  chart(
    "acceptance",
    current(
      "What share of evaluations passed?",
      "accepted · API · boolean. Averaging true (1) and false (0) gives the passing share among evaluated records. A missing evaluation is outside the denominator.",
      [
        score("pass", "accepted", "scores-boolean", [
          {
            id: "share",
            label: "Passed",
            measure: "value",
            aggregation: "avg",
          },
        ]),
      ],
      "LINE_TIME_SERIES",
      "percent",
    ),
  );
  chart(
    "outcomes",
    current(
      "Which outcomes did reviewers record?",
      "outcome · API · categorical. Count records in each category over the selected period.",
      [
        {
          ...score("outcomes", "outcome", "scores-categorical", [count]),
          dimensions: [{ field: "stringValue" }],
        },
      ],
      "HORIZONTAL_BAR",
    ),
  );
  note(
    "score_boundary",
    "When the question changes",
    "“Which traces contain an observation with a poor score?” changes the unit from evaluations to distinct traces. It needs a defined score-to-observation relationship, deduplication, and an explicit choice of event time or score time. Open **Editor options (⋮) → Plan a future query** to explore this relationship. A trace-name filter should say which records it can reach.",
  );

  chapter(
    "migration",
    "Replacing the Home cards",
    "Compare each original card with its editable recipe over the same window. Select a card to see which fields reproduce its result and which changes need a product decision.",
  );
  for (const [i, presetId] of HOME_DASHBOARD_PRESET_IDS.entries()) {
    const replacements = story.widgets.filter(
      (w) => w.type === "query" && w.id.startsWith(`replacement_${i}_`),
    );
    if (!replacements.length)
      throw new Error(`Missing replacement for ${presetId}`);
    const row = geometry(7);
    widgets.push({
      type: "preset",
      id: `before_${i}`,
      presetId,
      ...row,
      x_size: 6,
    });
    for (const [j, item] of replacements.entries()) {
      if (item.type !== "query") continue;
      // A boolean has two possible values, so two filtered counts can reproduce the fixed bins.
      const config =
        presetId === "home-score-analytics" && j === 2
          ? current(
              "Boolean score distribution",
              "Exact true and false counts by score name and source.",
              [false, true].map((value) => ({
                ...score(
                  value ? "passed" : "failed",
                  "accepted",
                  "scores-boolean",
                  [count],
                ),
                label: value ? "True" : "False",
                dimensions: [{ field: "name" }, { field: "source" }],
                filters: [
                  {
                    type: "boolean",
                    column: "booleanValue",
                    operator: "=",
                    value,
                  },
                ],
              })),
              "VERTICAL_BAR",
            )
          : { ...item.config, executionMode: "current" as const };
      widgets.push({
        ...item,
        config: config.display.timeSeries
          ? { ...config, display: { ...config.display, rowLimit: 1000 } }
          : config,
        compareWith: `before_${i}`,
        ...(j === 0 ? { ...row, x: 6, x_size: 6 } : geometry(7)),
      });
    }
  }
  note(
    "migration_policy",
    "How existing dashboards move",
    "**Curated Home.** Replace each card after its numbers, filters and empty states agree.\n\n**Customer dashboards.** Preview the original beside the replacement. Keep the placement and a way back. A changed denominator, unit or trace-duration definition requires an explicit choice.\n\n**New dashboards.** Offer an editable recipe for each verified replacement. Withdraw the corresponding legacy choice from the picker. Track additions, replacements, restores and in-card interactions to decide when the remaining presets can retire.",
  );

  chapter(
    "builder",
    "The query builder",
    "Which questions need new query semantics? Two experiments below execute against the prototype backend. The future editor also lets you compose proposed queries for discovery and relationships and inspect the contract they would need.",
  );
  chart("custom_percentile", {
    ...example("custom_percentile"),
    executionMode: "prototype",
    title: "What duration marks the fastest 10% of generations?",
  });
  chart("fixed_bands", {
    ...example("fixed_bands"),
    executionMode: "prototype",
    title: "Which latency band contains our observations?",
  });
  note(
    "builder_decisions",
    "Decisions for the data platform",
    "**Custom percentiles and bands.** Agree on accepted values, edge inclusion and overflow buckets. Measure aggregate-state memory at high cardinality. Fixed thresholds make charts comparable across release windows.\n\n**Discover the top spenders.** Group by the value at a metadata key, rank by total cost over the full period, then plot those same groups across time. Define missing keys, ties, the remainder and a cardinality budget. Three hand-picked filters demonstrate a different operation.\n\n**Cross-record questions.** Define score and event identities, project scope, join direction and time windows before supporting traces with a poorly scored span. Compare old and proposed query results on the same fixture.",
  );

  chapter(
    "roadmap",
    "From roadmap to release",
    "Use the report itself as the authoring surface. Start from a working example, change one input, run it, and record what you learn in a Markdown cell.",
  );
  chart("error_rate", {
    ...example("error_rate"),
    executionMode: "current",
    title: "What percentage of observations are errors?",
  });
  note(
    "math",
    "Computed metrics and multiple measures",
    "The error rate divides two aligned counts and formats the fraction as a percentage. A zero denominator has no rate. Today the browser can combine bounded query results. Sorting groups by a computed rate before truncating them needs a server expression and ordering contract. The Pulse example puts two measures in one chart.\n\n**Custom percentiles.** The existing engine supports p50, p75, p90, p95 and p99. The query-builder chapter runs p10 through the prototype and lets you change the parameter. Agree on precision and cost before rollout.\n\n**Custom histogram bands.** The existing engine chooses bands from the data. The prototype lets you enter fixed latency boundaries and compare the same bands between releases. Define underflow, overflow and missing values before making it a standard option.",
  );
  note(
    "authoring",
    "One place to build and explain",
    "Inline charts, editable Markdown and section headings turn a dashboard into a working report. Open **Edit chart** to explore the saved question. Under **Editor options (⋮)**, compare it with the classic editor or try experimental queries. The Home recipes teach users what they can plot.\n\nFor the wizard replacement, keep the existing source, filter, metric and visualization abstractions. Validate everyday editing details such as legend selection, score pickers, empty results and the path from a chart back to its records with users.",
  );
  note(
    "halo",
    "Halo and alert setup",
    "**Proposed.** Halo drafts the same editable query as the form. A person can inspect the selected definition, filters and units, run it on their project, and accept it. An alert can then reuse the validated query with a threshold, evaluation window, minimum sample count and schedule. Agree on these semantics before enabling execution in alerting.",
  );
  note(
    "release",
    "What we need to decide",
    "1. Start with existing queries, named scores, editable recipes and Markdown. Set a measured budget for independent queries and totals.\n2. Review the Home comparisons and decide which changed definitions can migrate and which need an opt-in.\n3. Align with the data platform on metadata grouping, computed ranking, custom aggregation parameters and relationship filters. Use these examples as acceptance cases for the query-builder contract.",
  );
  if (learningHref)
    note(
      "read_next",
      "Continue with the technical field guide",
      `Follow one request from observations and scores to a plotted value. The guide explains storage, aggregation, performance and the proposed query contract. [Read How Langfuse queries your data](${learningHref})`,
    );
  return DashboardDefinitionSchema.parse({ widgets });
}
