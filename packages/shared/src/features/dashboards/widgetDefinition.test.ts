import { describe, expect, it } from "vitest";
import {
  toWidgetDefinition,
  widgetDefinitionSchema,
  widgetDefinitionSaveSchema,
} from "./widgetDefinition";

const classic = {
  name: "Cost",
  description: "",
  view: "OBSERVATIONS",
  metrics: [{ measure: "totalCost", agg: "sum" }],
  dimensions: [],
  filters: [],
  chartType: "NUMBER",
};

describe("saved widget definitions", () => {
  it("adapts a classic widget into the current editable format", () => {
    const saved = toWidgetDefinition(classic);
    expect(saved).toMatchObject({
      version: 1,
      kind: "multiQuery",
      config: {
        tabs: [
          {
            queries: [
              { metrics: [{ measure: "totalCost", aggregation: "sum" }] },
            ],
          },
        ],
      },
    });
    expect(widgetDefinitionSaveSchema.parse(saved)).toEqual(saved);
    expect(toWidgetDefinition({ ...classic, definition: saved })).toEqual(
      saved,
    );
    expect(
      widgetDefinitionSchema.safeParse({ ...saved, version: 99 }).success,
    ).toBe(false);
  });

  it("opens queries with a retired measure or a broken formula so they can be repaired", () => {
    const saved = toWidgetDefinition(classic);
    if (saved.kind !== "multiQuery") throw new Error("Expected a chart");
    const tab = saved.config.tabs[0]!;
    const source = tab.queries[0]!;
    const metric = source.metrics[0]!;
    metric.measure = "retiredCost";
    tab.formulas = [
      {
        id: "ratio",
        label: "Ratio",
        expression: "missing.metric",
        format: "number",
      },
    ];
    expect(widgetDefinitionSchema.parse(saved)).toEqual(saved);
    const invalid = widgetDefinitionSaveSchema.safeParse(saved);
    expect(invalid.error?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        ["config", "tabs", 0, "queries", 0, "metrics", 0, "measure"],
        ["config", "tabs", 0, "formulas", 0, "expression"],
      ]),
    );
    metric.measure = "totalCost";
    tab.formulas[0]!.expression = "a.m0 / a.m0";
    expect(widgetDefinitionSaveSchema.parse(saved)).toEqual(saved);
  });
});
