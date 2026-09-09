import { describe, expect, it } from "vitest";
import {
  autoComparisonPreferenceChangedProps,
  baselineChangedProps,
  chartMetricChangedProps,
  chartMetricGroup,
  comparisonChangedProps,
  comparisonPickerOpenedProps,
  diffModeChangedProps,
  isSameDataset,
  itemRegressionFilterAppliedProps,
  layoutChangedProps,
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

  // The four-slot chart grid became one strip, so `chartIndex`/`slotCount` are
  // gone; the score's level and data type take their place. Same event name.
  it("maps chart metric ids to a shape without keeping the id", () => {
    expect(chartMetricGroup("base:cost")).toBe("base");
    expect(chartMetricGroup("obs-score-numeric:helpfulness")).toBe("score");
    const payload = chartMetricChangedProps({
      tableName: "experiments",
      metricId: "obs-score-numeric:helpfulness",
    });
    expect(payload).toEqual({
      isV4: true,
      tableName: "experiments",
      metricGroup: "score",
      scoreLevel: "observation",
      dataType: "numeric",
    });
    expectMetadataOnly(payload);

    expect(
      chartMetricChangedProps({
        tableName: "experiments",
        metricId: "base:cost",
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiments",
      metricGroup: "base",
      scoreLevel: "none",
      dataType: "none",
    });

    // Trace-level scores only became selectable in this change.
    expect(
      chartMetricChangedProps({
        tableName: "experiments",
        metricId: "trace-score-categorical:tone",
      }),
    ).toMatchObject({ scoreLevel: "trace", dataType: "categorical" });
    expect(
      chartMetricChangedProps({
        tableName: "experiments",
        metricId: "experiment-score-numeric:accuracy",
      }),
    ).toMatchObject({ scoreLevel: "experiment", dataType: "numeric" });
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

  // `charts_section_toggled` and `analytics_tab_opened` are gone with the
  // accordion and the Analytics route; the layout, diff-mode and
  // auto-comparison events replace them on the surfaces that exist now.
  it("keeps baseline, layout, diff mode and the auto preference on metadata only", () => {
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
    const layout = layoutChangedProps({
      tableName: "experiment-items",
      layout: "matrix",
      comparisonCount: 2,
    });
    expect(layout).toEqual({
      isV4: true,
      tableName: "experiment-items",
      layout: "matrix",
      comparisonCount: 2,
    });
    expectMetadataOnly(layout);
    const diff = diffModeChangedProps({
      tableName: "experiment-items",
      mode: "expected",
      comparisonCount: 0,
    });
    expect(diff).toEqual({
      isV4: true,
      tableName: "experiment-items",
      mode: "expected",
      comparisonCount: 0,
    });
    expectMetadataOnly(diff);
    expect(
      autoComparisonPreferenceChangedProps({
        tableName: "experiment-items",
        isEnabled: false,
      }),
    ).toEqual({
      isV4: true,
      tableName: "experiment-items",
      isEnabled: false,
    });
  });

  // Same event name, repointed at the score-comparison filter ("worse than the
  // comparison"). No `column`: here the filtered column is a score, and a score
  // name is user content, so the level and data type describe it instead.
  it("describes a score-comparison filter by shape, not by score name", () => {
    const payload = itemRegressionFilterAppliedProps({
      tableName: "experiment-items",
      scoreLevel: "trace",
      dataType: "NUMERIC",
      operator: "lower",
      comparisonExperimentId: "cmp-2",
      comparisonIds: ["cmp-1", "cmp-2"],
      source: "header_menu",
    });
    expect(payload).toEqual({
      isV4: true,
      tableName: "experiment-items",
      scoreLevel: "trace",
      dataType: "NUMERIC",
      operator: "lower",
      comparisonIndex: 1,
      source: "header_menu",
    });
    expect(payload).not.toBeNull();
    expectMetadataOnly(payload!);
    expect(payload).not.toHaveProperty("column");

    // An unknown data type is reported as such rather than dropped, so the
    // property is present on every event.
    expect(
      itemRegressionFilterAppliedProps({
        tableName: "experiment-items",
        scoreLevel: "observation",
        dataType: undefined,
        operator: "different",
        comparisonExperimentId: "cmp-1",
        comparisonIds: ["cmp-1"],
        source: "url",
      }),
    ).toMatchObject({ dataType: "unknown", comparisonIndex: 0 });
  });

  // A shared URL can outlive the run its filter points at. The table treats
  // that filter as inactive, so there is no applied filter to report — an
  // out-of-range index would be noise in the funnel.
  it("reports no event for a filter pointing outside the compared runs", () => {
    expect(
      itemRegressionFilterAppliedProps({
        tableName: "experiment-items",
        scoreLevel: "trace",
        dataType: "NUMERIC",
        operator: "lower",
        comparisonExperimentId: "cmp-gone",
        comparisonIds: ["cmp-1", "cmp-2"],
        source: "url",
      }),
    ).toBeNull();
  });
});
