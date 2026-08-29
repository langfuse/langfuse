import { describe, expect, it } from "vitest";
import {
  analyticsTabOpenedProps,
  baselineChangedProps,
  chartMetricChangedProps,
  chartMetricGroup,
  chartsSectionToggledProps,
  comparisonChangedProps,
  comparisonPickerOpenedProps,
  isSameDataset,
  itemRegressionFilterAppliedProps,
  scoreColumnGroupScope,
  scoreColumnScopeToggledProps,
  uniqueDatasetCount,
} from "./analytics";

const payloadKeys = (payload: object) => Object.keys(payload);

const CONTENT_KEYS = new Set([
  "name",
  "value",
  "query",
  "search",
  "prompt",
  "experimentName",
  "datasetName",
  "filter",
  "metricId",
  "searchQuery",
]);

function expectMetadataOnly(payload: object) {
  for (const key of payloadKeys(payload)) {
    expect(CONTENT_KEYS.has(key), `payload must not include ${key}`).toBe(
      false,
    );
  }
  expect(JSON.stringify(payload)).not.toMatch(/helpfulness|My Experiment/i);
}

describe("experiment analytics payloads", () => {
  it("treats a single known dataset as same-dataset", () => {
    expect(isSameDataset(["ds-1"])).toBe(true);
    expect(isSameDataset(["ds-1", "ds-1"])).toBe(true);
    expect(isSameDataset(["ds-1", "ds-2"])).toBe(false);
    expect(isSameDataset(["ds-1", null, "ds-1"])).toBe(true);
    expect(uniqueDatasetCount(["ds-1", null, "ds-2", "ds-1"])).toBe(2);
  });

  it("maps chart metric ids to groups without keeping the id", () => {
    expect(chartMetricGroup("base:cost")).toBe("base");
    expect(chartMetricGroup("obs-score-numeric:helpfulness")).toBe("score");
    const payload = chartMetricChangedProps({
      tableName: "experiments",
      metricId: "obs-score-numeric:helpfulness",
      chartIndex: 1,
      slotCount: 3,
    });
    expect(payload).toEqual({
      isV4: true,
      tableName: "experiments",
      metricGroup: "score",
      chartIndex: 1,
      slotCount: 3,
    });
    expectMetadataOnly(payload);
  });

  it("maps score column groups to scopes and ignores unknown groups", () => {
    expect(scoreColumnGroupScope("traceItemScores")).toBe("trace");
    expect(scoreColumnGroupScope("traceScores")).toBe("trace");
    expect(scoreColumnGroupScope("observationItemScores")).toBe("observation");
    expect(scoreColumnGroupScope("observationScores")).toBe("observation");
    expect(scoreColumnGroupScope("experimentScores")).toBe("experiment");
    expect(scoreColumnGroupScope("name")).toBeNull();
    expect(
      scoreColumnScopeToggledProps({
        tableName: "experiments",
        groupId: "name",
        enabledCount: 2,
      }),
    ).toBeNull();
  });

  it("builds comparison_changed without names or ids of experiments", () => {
    const payload = comparisonChangedProps({
      tableName: "experiment-items",
      comparisonCount: 2,
      datasetIds: ["ds-a", "ds-a", "ds-b"],
      source: "picker",
    });
    expect(payload).toEqual({
      isV4: true,
      tableName: "experiment-items",
      comparisonCount: 2,
      isSameDataset: false,
      source: "picker",
    });
    expectMetadataOnly(payload);
  });

  it("counts options and datasets on picker open from lengths, not query text", () => {
    const payload = comparisonPickerOpenedProps({
      tableName: "experiment-items",
      optionCount: 12,
      datasetIds: ["ds-1", "ds-2", "ds-1"],
      queryLength: "My Experiment".length,
    });
    expect(payload).toEqual({
      isV4: true,
      tableName: "experiment-items",
      optionCount: 12,
      datasetCount: 2,
      hasSearchQuery: true,
      queryLength: 13,
    });
    expect(payload).not.toHaveProperty("query");
    expectMetadataOnly(payload);
  });

  it("keeps baseline, charts toggle, and analytics tab on metadata only", () => {
    expect(
      baselineChangedProps({
        tableName: "experiment-items",
        source: "clear",
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiment-items",
      source: "clear",
    });
    expect(
      chartsSectionToggledProps({
        tableName: "experiments",
        isExpanded: false,
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiments",
      isExpanded: false,
    });
    expect(
      analyticsTabOpenedProps({
        tableName: "experiment-items",
        hasComparison: true,
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiment-items",
      hasComparison: true,
    });
  });

  it("emits regression-filter props only when retargeting to a comparison", () => {
    expect(
      itemRegressionFilterAppliedProps({
        tableName: "experiment-items",
        column: "latency",
        operator: ">",
        toExperimentId: "baseline-1",
        baselineId: "baseline-1",
        comparisonIds: ["cmp-1"],
      }),
    ).toBeNull();
    expect(
      itemRegressionFilterAppliedProps({
        tableName: "experiment-items",
        column: "latency",
        operator: ">",
        toExperimentId: "cmp-1",
        baselineId: "baseline-1",
        comparisonIds: ["cmp-1", "cmp-2"],
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiment-items",
      column: "latency",
      comparisonIndex: 0,
      operator: ">",
    });
  });
});
