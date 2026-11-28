import { describe, expect, it } from "vitest";
import { HOME_DASHBOARD_PRESET_IDS } from "@langfuse/shared";
import { multiQueryConfigSaveSchema } from "@langfuse/shared/dashboards";
import { buildMultiQueryPlan } from "./multi-query/multiQueryModel";
import { homeScoreRows } from "./multi-query/homeScoreAggregate";
import {
  buildHomeWidgetRecipe,
  type HomeWidgetRecipeContext,
} from "./homeWidgetRecipes";

const models = ["alpha", "beta"];
const scores = [
  { name: "Quality", source: "EVAL", dataType: "NUMERIC" },
  { name: "Quality", source: "API", dataType: "BOOLEAN" },
  { name: "Outcome", source: "ANNOTATION", dataType: "CATEGORICAL" },
];
const dateRange = {
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-08T00:00:00.000Z"),
};
function editable(presetId: string, context: HomeWidgetRecipeContext) {
  const recipe = buildHomeWidgetRecipe(presetId, context);
  if ("reason" in recipe) throw new Error(recipe.reason);
  return recipe;
}
describe.each(["v1", "v2"] as const)(
  "Home widget recipes for metrics %s",
  (version) => {
    it.each(HOME_DASHBOARD_PRESET_IDS)(
      "builds a saved, executable %s using the project's read path",
      (preset) => {
        const { config } = editable(preset, { version, models, scores });
        multiQueryConfigSaveSchema.parse(config);
        for (const tab of config.tabs) {
          const plan = buildMultiQueryPlan(
            {
              id: tab.id,
              label: tab.label,
              queries: tab.queries,
              display: tab.display,
            },
            {
              readPath: version === "v1" ? "v3" : "v4",
              dateRange,
              filterState: [
                {
                  column: "environment",
                  type: "stringOptions",
                  operator: "any of",
                  value: ["test"],
                },
              ],
            },
          );
          expect(plan.warnings).toEqual([]);
          expect(plan.queries).toHaveLength(tab.queries.length);
          for (const planned of plan.queries) {
            expect(planned.version, tab.label).toBe(version);
            expect(planned.query.filters).toContainEqual(
              expect.objectContaining({
                column: "environment",
                value: ["test"],
              }),
            );
            expect(planned.query.fromTimestamp).toBe(
              dateRange.from.toISOString(),
            );
          }
        }
      },
    );
    it("keeps the cardinality measure, null-name scope and ungrouped total independent", () => {
      const { config } = editable("home-traces", { version });
      const [top, whole] = config.tabs;
      expect(top?.display.rowLimit).toBe(20);
      expect(top?.queries[0]?.dimensions).toEqual([
        { field: version === "v2" ? "traceName" : "name" },
      ]);
      expect(whole?.queries[0]).toMatchObject({
        view: version === "v2" ? "observations" : "traces",
        dimensions: [],
        filters: [],
        metrics: [
          {
            measure: version === "v2" ? "traceId" : "count",
            aggregation: version === "v2" ? "uniq" : "count",
          },
        ],
      });
      expect(
        top?.queries[0]?.filters.some(
          (f) => f.column === "traceName" && f.operator === "is not null",
        ),
      ).toBe(version === "v2");
      const latency = editable("home-latency-table-traces", { version }).config
        .tabs[0]!.queries[0]!;
      expect(latency.view).toBe(version === "v2" ? "observations" : "traces");
      expect(
        latency.filters.some((f) => f.column === "isRootObservation"),
      ).toBe(version === "v2");
    });
    it("carries the selected models and current native tab without changing the saved default", () => {
      const recipe = editable("home-model-usage", {
        version,
        models,
        activeTab: "2",
      });
      expect(recipe.initialTabId).toBe("usageByModel");
      expect(recipe.config.tabs[0]?.id).toBe("costByModel");
      expect(recipe.config.tabs.slice(0, 4).map((t) => t.id)).toEqual([
        "costByModel",
        "costByType",
        "usageByModel",
        "usageByType",
      ]);
      for (const t of recipe.config.tabs) {
        expect(t.queries[0]?.filters).toContainEqual({
          column: "providedModelName",
          type: "stringOptions",
          operator: "any of",
          value: models,
        });
      }
      expect(
        editable("home-generation-latency", { version, models, activeTab: "4" })
          .initialTabId,
      ).toBe("p99");
      expect(
        buildHomeWidgetRecipe("home-model-usage", { version, models: [] }),
      ).toHaveProperty("reason");
    });
    it("preserves score identity and the different meanings of empty, zero and categorical values", () => {
      const { config } = editable("home-score-analytics", { version, scores });
      expect(config.tabs).toHaveLength(6);
      for (const [index, score] of scores.entries()) {
        for (const tab of config.tabs.slice(index * 2, index * 2 + 2)) {
          expect(tab.queries[0]?.filters).toEqual(
            Object.entries(score).map(([column, value]) => ({
              column,
              value,
              type: "string",
              operator: "=",
            })),
          );
        }
      }
      expect(new Set(config.tabs.map((t) => t.label)).size).toBe(6);
      const table = editable("home-scores-table", { version }).config;
      for (const [id, value] of [
        ["zeros", 0],
        ["ones", 1],
      ] as const) {
        const source = table.tabs[0]!.queries.find((q) => q.id === id)!;
        expect(source.view).toBe(
          version === "v1" ? "scores" : "scores-numeric",
        );
        expect(source.filters).toContainEqual({
          column: "value",
          type: "number",
          operator: "=",
          value,
        });
      }
      const total = table.tabs.find((t) => t.id === "total")!;
      if (version === "v1") {
        expect(total.queries).toHaveLength(1);
        expect(total.queries[0]).toMatchObject({
          view: "scores",
          dimensions: [],
          filters: [],
        });
        const other = table.tabs.find((t) => t.id === "other")!;
        expect(other.queries[0]!.filters).toContainEqual({
          column: "dataType",
          type: "stringOptions",
          operator: "none of",
          value: ["NUMERIC", "BOOLEAN", "CATEGORICAL"],
        });
        const plan = buildMultiQueryPlan(
          {
            id: total.id,
            label: total.label,
            queries: total.queries,
            display: total.display,
          },
          { readPath: "v3", dateRange, filterState: [] },
        );
        const projected = homeScoreRows(plan.queries[0]!.query, [
          {
            scoreName: "Explanation",
            scoreSource: "API",
            scoreDataType: "TEXT",
            countScoreId: 12,
            avgValue: 0,
          },
          {
            scoreName: "Correction",
            scoreSource: "ANNOTATION",
            scoreDataType: "CORRECTION",
            countScoreId: 3,
            avgValue: 0,
          },
          {
            scoreName: "Quality",
            scoreSource: "EVAL",
            scoreDataType: "NUMERIC",
            countScoreId: 5,
            avgValue: 0.8,
          },
        ]);
        expect(projected).toEqual([{ count_count: 20 }]);
      } else {
        expect(
          total.queries.map((q) => [q.view, q.hidden, q.dimensions]),
        ).toEqual([
          ["scores-numeric", true, []],
          ["scores-categorical", true, []],
        ]);
        expect(total.formulas?.[0]?.expression).toBe(
          "numeric.count + categorical.count",
        );
      }
      expect(
        buildHomeWidgetRecipe("home-score-analytics", { version, scores: [] }),
      ).toHaveProperty("reason");
      expect(
        buildHomeWidgetRecipe("home-score-analytics", {
          version,
          scores: [...scores, ...scores],
        }),
      ).toHaveProperty("reason");
    });
  },
);

it("regroups all Home score records before ranking and keeps categorical placeholders out of numeric means", () => {
  const recipe = editable("home-scores-table", { version: "v1" });
  const tab = recipe.config.tabs[0]!;
  const query = buildMultiQueryPlan(
    {
      id: tab.id,
      label: "Mean per source",
      queries: [
        {
          ...tab.queries[0]!,
          dimensions: [{ field: "source" }],
          filters: [],
          orderBy: [{ field: "avg_value", direction: "desc" }],
        },
      ],
      display: { chartType: "PIVOT_TABLE", rowLimit: 1 },
    },
    { dateRange, filterState: [], readPath: "v3" },
  ).queries[0]!.query;
  expect(
    homeScoreRows(query, [
      {
        scoreSource: "API",
        scoreDataType: "NUMERIC",
        countScoreId: 1,
        avgValue: 0,
      },
      {
        scoreSource: "API",
        scoreDataType: "BOOLEAN",
        countScoreId: 9,
        avgValue: 1,
      },
      {
        scoreSource: "API",
        scoreDataType: "TEXT",
        countScoreId: 100,
        avgValue: 0,
      },
      {
        scoreSource: "EVAL",
        scoreDataType: "NUMERIC",
        countScoreId: 30,
        avgValue: 0.7,
      },
    ]),
  ).toEqual([{ source: "API", count_count: 110, avg_value: 0.9 }]);
});
