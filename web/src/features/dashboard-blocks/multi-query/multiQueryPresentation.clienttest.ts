import { describe, expect, it } from "vitest";
import {
  createMultiQueryConfig,
  type MultiQuerySeries,
  type MultiQueryValue,
} from "./multiQueryModel";
import { prepareMultiQueryUnitVisualization } from "./multiQueryPresentation";

describe("multi-query value presentation", () => {
  it("shows an empty score mean as no measured value while keeping a genuine zero", () => {
    const config = createMultiQueryConfig();
    config.display.chartType = "NUMBER";
    const series: MultiQuerySeries = {
      id: "a.score",
      label: "Quality",
      unit: undefined,
      aggregation: "avg",
      color: "blue",
      fillColor: "lightblue",
    };
    const row: MultiQueryValue = {
      seriesId: series.id,
      queryId: "a",
      metricId: "score",
      queryLabel: "Quality",
      metricLabel: "Average value",
      time: null,
      dimensions: {},
      unit: undefined,
      value: null,
      evaluationCount: 0,
    };
    const noValue = prepareMultiQueryUnitVisualization(
      config,
      [series],
      [row],
      { visualization: { type: "empty" } },
    );
    expect(noValue.type).toBe("empty");
    const actualZero = prepareMultiQueryUnitVisualization(
      config,
      [series],
      [{ ...row, value: 0, evaluationCount: 1 }],
      { visualization: { type: "empty" } },
    );
    expect(actualZero).toMatchObject({ type: "number", value: 0 });
  });
});

it("shows the empty population when a comparison contains only zero record counts", () => {
  const config = createMultiQueryConfig();
  const series = {
    id: "a.count",
    label: "A",
    aggregation: "count",
    unit: "integer",
    color: "blue",
    fillColor: "blue",
  };
  const row = {
    seriesId: series.id,
    queryId: "a",
    metricId: "count",
    queryLabel: "A",
    metricLabel: "Count",
    time: null,
    dimensions: {},
    value: 0,
    unit: "integer",
  };
  const view = prepareMultiQueryUnitVisualization(config, [series], [row], {
    visualization: { type: "empty" },
  });
  expect(view).toMatchObject({ type: "empty", message: "0 matching records" });
});
