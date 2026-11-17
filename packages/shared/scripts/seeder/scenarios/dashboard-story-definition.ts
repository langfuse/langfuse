import {
  StudioWidgetConfigSchema,
  type StudioWidgetConfig,
} from "../../../src/domain/dashboard-studio";
import { HOME_DASHBOARD_PRESET_IDS } from "../../../src/domain/home-dashboard";
import { getStudioPresetReplacement } from "../../../src/domain/dashboard-studio-presets";
import { DashboardDefinitionSchema } from "../../../src/server/services/DashboardService/types";
import type { FilterState } from "../../../src/types";

const metric = (
  id: string,
  measure: string,
  aggregation: StudioWidgetConfig["queries"][number]["metrics"][number]["aggregation"],
) => ({ id, measure, aggregation });
const count = metric("count", "count", "count");
const generations: FilterState = [
  {
    column: "type",
    type: "stringOptions",
    operator: "any of",
    value: ["GENERATION"],
  },
];
const query = (
  id: string,
  label: string,
  metrics: StudioWidgetConfig["queries"][number]["metrics"] = [count],
  dimensions: string[] = [],
  filters: FilterState = [],
  view: StudioWidgetConfig["queries"][number]["view"] = "observations",
  scoreTarget: StudioWidgetConfig["queries"][number]["scoreTarget"] = "all",
) => ({
  id,
  label,
  view,
  ...(view.startsWith("scores-") ? { scoreTarget } : {}),
  metrics,
  dimensions: dimensions.map((field) => ({ field })),
  filters,
});
const config = (
  title: string,
  description: string,
  queries: StudioWidgetConfig["queries"],
  chartType: StudioWidgetConfig["display"]["chartType"] = "VERTICAL_BAR",
  options: Partial<StudioWidgetConfig["display"]> = {},
  expressions: StudioWidgetConfig["expressions"] = [],
) =>
  StudioWidgetConfigSchema.parse({
    version: 1,
    title,
    description,
    queries,
    expressions,
    display: { chartType, rowLimit: 25, legend: true, ...options },
  });

const modelNames = Array.from(
  { length: 10 },
  (_, index) => `studio-model-${String(index + 1).padStart(2, "0")}`,
);
const selectedModels: FilterState = [
  ...generations,
  {
    column: "providedModelName",
    type: "stringOptions",
    operator: "any of",
    value: modelNames,
  },
];

const recipeFor = (presetId: (typeof HOME_DASHBOARD_PRESET_IDS)[number]) => {
  const [recipe] = getStudioPresetReplacement(presetId);
  if (
    presetId === "home-generation-latency" ||
    presetId === "home-model-usage"
  ) {
    for (const item of recipe.queries) item.filters = selectedModels;
    recipe.description +=
      " Saved selection: studio-model-01 through studio-model-10. Select these same ten models in the legacy dropdown for an exact comparison.";
  }
  return recipe;
};

export const buildDashboardStoryDefinition = (
  observationCount: number,
  days: number,
) => {
  const widgets: unknown[] = [];
  const text = (
    id: string,
    y: number,
    title: string,
    content: string,
    height = 3,
  ) =>
    widgets.push({
      type: "text",
      id,
      x: 0,
      y,
      x_size: 12,
      y_size: height,
      title,
      content,
    });
  const chart = (
    id: string,
    y: number,
    x: number,
    value: StudioWidgetConfig,
    width = 6,
    height = 6,
  ) =>
    widgets.push({
      type: "query",
      id,
      x,
      y,
      x_size: width,
      y_size: height,
      config: value,
    });
  text(
    "story_intro",
    0,
    "From presets to questions",
    `# Dashboards: from presets to questions\n\nA real, editable dashboard with **${observationCount.toLocaleString("en-US")} synthetic observations over ${days} days**. Start with a question, compare several populations, and explain the answer with text.\n\nUse the full ${days}-day range for the truth fixture. Every chart below is saved configuration, not a screenshot.`,
    2,
  );
  const presence: StudioWidgetConfig["queries"] = ["abc", "bbc"].map((key) =>
    query(
      key,
      `metadata.${key} exists`,
      [count],
      [],
      [
        {
          column: "metadata",
          key,
          type: "stringObject",
          operator: "is set",
          value: "",
        },
      ],
    ),
  );
  chart(
    "presence",
    2,
    0,
    config(
      "Two questions, two bars",
      "Count observations where each metadata key exists. Empty values are still present. An observation carrying both keys belongs to both series.",
      presence,
      "VERTICAL_BAR",
      { showHeadline: true },
    ),
  );
  chart(
    "overlap",
    2,
    6,
    config(
      "Count the overlap honestly",
      `Independent cohorts overlap; their sum is not a distinct total. Full fixture: abc ${observationCount * 0.6}; bbc ${observationCount * 0.5}; overlap ${observationCount * 0.2}; union ${observationCount * 0.9}.`,
      [
        ...presence,
        query(
          "both",
          "Both keys",
          [count],
          [],
          presence.flatMap((q) => q.filters),
        ),
      ],
      "NUMBER",
    ),
  );
  chart("latency_overlay", 8, 0, recipeFor("home-generation-latency"));
  chart(
    "error_rate",
    8,
    6,
    config(
      "Errors as a percentage",
      "A named formula over two hidden inputs. A zero denominator is a missing value, not an invented zero percent.",
      [
        {
          ...query(
            "errors",
            "Errors",
            [count],
            [],
            [
              {
                column: "level",
                type: "stringOptions",
                operator: "any of",
                value: ["ERROR"],
              },
            ],
          ),
          hidden: true,
        },
        { ...query("all", "All observations"), hidden: true },
      ],
      "LINE_TIME_SERIES",
      { timeSeries: true, unit: "percent" },
      [
        {
          id: "error_rate",
          label: "Error rate",
          formula: "errors.count / all.count",
          unit: "percent",
        },
      ],
    ),
  );
  chart(
    "custom_percentile",
    14,
    0,
    config(
      "Choose the percentile you need",
      "A real backend quantile parameter: p10 beside p50 and p90. Durations are in milliseconds; percentiles are queried from observations, not reconstructed from chart buckets.",
      [
        query(
          "low",
          "p10",
          [
            {
              id: "p10",
              measure: "latency",
              aggregation: "p50",
              percentile: 10,
            },
          ],
          [],
          generations,
        ),
        query(
          "percentiles",
          "Latency",
          [metric("p50", "latency", "p50"), metric("p90", "latency", "p90")],
          [],
          generations,
        ),
      ],
      "NUMBER",
      { unit: "milliseconds" },
    ),
  );
  chart(
    "fixed_bands",
    14,
    6,
    config(
      "Choose exact histogram bands",
      "Exact observation counts in explicit latency intervals, in milliseconds: below zero, [0,1000), [1000,5000), [5000,30000), [30000,120000), 120000 or more, plus missing durations. These are not approximate adaptive bins.",
      [
        query("bands", "Observation latency", [
          metric("distribution", "latency", "histogram"),
        ]),
      ],
      "HISTOGRAM",
      { histogramEdges: [0, 1000, 5000, 30000, 120000], unit: "observations" },
    ),
  );
  chart(
    "active_days",
    20,
    0,
    config(
      "Active days (UTC)",
      "Distinct UTC calendar dates containing at least one observation. This is a real aggregate, not an estimate from displayed buckets.",
      [query("days", "Active days", [metric("days", "activeDays", "uniq")])],
      "NUMBER",
    ),
  );
  chart(
    "two_numbers",
    20,
    6,
    config(
      "Accepted out of evaluated",
      "Two exact observation-attached score counts in one tile. One boolean accepted score is seeded per evaluated trace; this definition counts score records, not arbitrary distinct observations.",
      [
        query(
          "accepted",
          "Accepted",
          [count],
          [],
          [
            {
              column: "name",
              type: "stringOptions",
              operator: "any of",
              value: ["accepted"],
            },
            {
              column: "booleanValue",
              type: "boolean",
              operator: "=",
              value: true,
            },
          ],
          "scores-boolean",
          "observation",
        ),
        query(
          "evaluated",
          "Evaluated",
          [count],
          [],
          [
            {
              column: "name",
              type: "stringOptions",
              operator: "any of",
              value: ["accepted"],
            },
          ],
          "scores-boolean",
          "observation",
        ),
      ],
      "NUMBER",
    ),
  );
  text(
    "parity_intro",
    26,
    "Every frozen card has a recipe",
    "## Before → after\n\nThe left column contains the current Home card. The right column is an editable query built from the same source vocabulary. Compare definitions, filters and period totals—not only the chart's shape. **Intentional changes are named in each description.**",
    2,
  );
  let y = 28;
  for (const [index, presetId] of HOME_DASHBOARD_PRESET_IDS.entries()) {
    const recipe = recipeFor(presetId);
    text(
      `recipe_${index}`,
      y,
      `${index + 1}. ${recipe.title}`,
      `**Before:** ${presetId.replaceAll("home-", "").replaceAll("-", " ")} → **After:** ${recipe.title}.\n\n${recipe.description}`,
      2,
    );
    const replacements =
      presetId === "home-score-analytics"
        ? getStudioPresetReplacement(presetId)
        : [recipe];
    widgets.push({
      type: "preset",
      id: `legacy_${index}`,
      presetId,
      x: 0,
      y: y + 2,
      x_size: 6,
      y_size: 7,
    });
    chart(`replacement_${index}_0`, y + 2, 6, replacements[0], 6, 7);
    replacements
      .slice(1)
      .forEach((replacement, offset) =>
        chart(
          `replacement_${index}_${offset + 1}`,
          y + 9 + Math.floor(offset / 2) * 7,
          (offset % 2) * 6,
          replacement,
          6,
          7,
        ),
      );
    y += 9 + Math.ceil((replacements.length - 1) / 2) * 7;
  }
  text(
    "review_notes",
    y,
    "Decisions for the backend review",
    "## What the demo proves\n\nIndependent filtered series, multiple metrics, formulas, configurable percentiles, exact histogram intervals, active UTC days, true period summaries and text all use the saved dashboard contract. Score analytics expands into ordinary distribution and trend charts for numeric, boolean and categorical scores. Open any chart's editor to inspect its query.\n\n## Questions still worth testing\n\nMetadata-key grouping and score-to-observation relationship filters need their own supported query semantics. A fast local query is not a production performance guarantee.\n\nMigration should preserve the original card until its meaning, selected score definition and layout are verified.",
    3,
  );
  return DashboardDefinitionSchema.parse({ widgets });
};
