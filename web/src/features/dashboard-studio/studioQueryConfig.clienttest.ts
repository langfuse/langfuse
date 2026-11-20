import { describe, expect, it } from "vitest";
import {
  StudioWidgetConfigSchema,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { createStudioWidget } from "./catalog";
import {
  getStudioRenderConfig,
  canPreviewStudioFormulasLocally,
  getStudioApplyBlockReason,
  hasStudioQueryChanges,
  toStudioQueryConfig,
} from "./studioQueryConfig";

function initial() {
  const config = createStudioWidget();
  config.display = {
    ...config.display,
    chartType: "LINE_TIME_SERIES",
    timeSeries: true,
    showHeadline: false,
  };
  config.queries[0]!.metrics[0]!.label = "Original count";
  config.expressions = [{ id: "rate", label: "Rate", formula: "a.count * 2" }];
  return config;
}

describe("widget execution and live presentation", () => {
  it("recalculates valid formulas only over sources already requested by the last preview", () => {
    const saved = initial();
    saved.executionMode = "current";
    saved.queries.push({
      ...structuredClone(saved.queries[0]!),
      id: "b",
      label: "Second",
    });
    saved.display.activeQueryIds = ["a"];
    const edited = structuredClone(saved);
    edited.expressions[0]!.formula = "a.count / 2";
    expect(canPreviewStudioFormulasLocally(edited, saved, "v2")).toBe(true);
    edited.expressions[0]!.formula = "a.count / b.count";
    expect(canPreviewStudioFormulasLocally(edited, saved, "v2")).toBe(false);
    delete saved.display.activeQueryIds;
    delete edited.display.activeQueryIds;
    expect(canPreviewStudioFormulasLocally(edited, saved, "v2")).toBe(true);
    edited.queries[0]!.dimensions = [{ field: "level" }];
    expect(canPreviewStudioFormulasLocally(edited, saved, "v2")).toBe(false);
    edited.queries[0]!.dimensions = [];
    edited.expressions[0]!.formula = "a.count /";
    expect(canPreviewStudioFormulasLocally(edited, saved, "v2")).toBe(false);
  });

  it("applies only a current complete preview, including empty data and cached presentation edits", () => {
    const lastRun = initial();
    const complete = {
      fetchStatus: "idle" as const,
      isPending: false,
      isError: false,
      data: { status: "complete" as const, rows: [] },
    };
    const draft = structuredClone(lastRun);
    draft.expressions[0]!.formula = "a.count / (";
    expect(getStudioApplyBlockReason(draft, lastRun, complete)).not.toBeNull();
    expect(
      getStudioApplyBlockReason(draft, draft, {
        ...complete,
        isError: true,
        data: undefined,
      }),
    ).not.toBeNull();
    expect(
      getStudioApplyBlockReason(draft, draft, {
        ...complete,
        data: { status: "error" },
      }),
    ).not.toBeNull();
    expect(
      getStudioApplyBlockReason(lastRun, lastRun, {
        ...complete,
        data: { status: "partial" },
      }),
    ).not.toBeNull();
    expect(
      getStudioApplyBlockReason(lastRun, lastRun, {
        ...complete,
        fetchStatus: "fetching",
      }),
    ).not.toBeNull();
    expect(
      getStudioApplyBlockReason(lastRun, lastRun, {
        ...complete,
        isPending: true,
        data: undefined,
      }),
    ).not.toBeNull();
    expect(getStudioApplyBlockReason(lastRun, lastRun, complete)).toBeNull();
    const presentation = { ...lastRun, title: "A clearer title" };
    expect(
      getStudioApplyBlockReason(presentation, lastRun, complete),
    ).toBeNull();
  });
  it("hides an existing headline immediately while retaining the last executed summary request", () => {
    const lastRun = initial();
    lastRun.display.showHeadline = true;
    const draft = structuredClone(lastRun);
    draft.display.showHeadline = false;
    expect(hasStudioQueryChanges(draft, lastRun)).toBe(true);
    expect(getStudioRenderConfig(lastRun, draft).display.showHeadline).toBe(
      false,
    );
    expect(toStudioQueryConfig(lastRun).display.showHeadline).toBe(true);
  });

  it("keeps presentation changes out of the actual request and applies them to last-run data", () => {
    const lastRun = initial();
    const draft = structuredClone(lastRun);
    draft.title = "Live title";
    draft.description = "Live description";
    draft.display = {
      ...draft.display,
      unit: "percent",
      legend: false,
      hiddenSeriesIds: ["a.count"],
      chartType: "AREA_TIME_SERIES",
      headlineMetricRef: "a.count",
    };
    draft.queries[0]!.label = "Friendly name";
    draft.queries[0]!.hidden = true;
    draft.queries[0]!.metrics[0]!.label = "Requests";
    draft.expressions[0] = {
      ...draft.expressions[0]!,
      label: "Live formula",
      unit: "percent",
      hidden: true,
    };
    expect(toStudioQueryConfig(draft)).toEqual(toStudioQueryConfig(lastRun));
    expect(
      StudioWidgetConfigSchema.safeParse(toStudioQueryConfig(draft)).success,
    ).toBe(true);
    expect(hasStudioQueryChanges(draft, lastRun)).toBe(false);
    const rendered = getStudioRenderConfig(lastRun, draft);
    expect(rendered.title).toBe("Live title");
    expect(rendered.queries[0]!.label).toBe("Friendly name");
    expect(rendered.queries[0]!.metrics[0]!.label).toBe("Requests");
    expect(rendered.display.chartType).toBe("AREA_TIME_SERIES");
    expect(rendered.expressions[0]!.unit).toBe("percent");
  });

  it.each([
    [
      "filter",
      (c: StudioWidgetConfig) => {
        c.queries[0]!.filters = [
          {
            column: "environment",
            type: "stringOptions",
            operator: "any of",
            value: ["staging"],
          },
        ];
      },
    ],
    [
      "measure",
      (c: StudioWidgetConfig) => {
        c.queries[0]!.metrics[0]!.measure = "totalCost";
      },
    ],
    [
      "metric removal",
      (c: StudioWidgetConfig) => {
        c.queries[0]!.metrics = [];
      },
    ],
    [
      "summary",
      (c: StudioWidgetConfig) => {
        c.display.showHeadline = true;
      },
    ],
    [
      "time",
      (c: StudioWidgetConfig) => {
        c.display.timeSeries = false;
      },
    ],
    [
      "histogram",
      (c: StudioWidgetConfig) => {
        c.display.histogramEdges = [0, 1000, 5000];
      },
    ],
    [
      "limit",
      (c: StudioWidgetConfig) => {
        c.display.rowLimit = 123;
      },
    ],
    [
      "formula",
      (c: StudioWidgetConfig) => {
        c.expressions[0]!.formula = "a.count * 3";
      },
    ],
    [
      "pivot",
      (c: StudioWidgetConfig) => {
        c.display.chartType = "PIVOT_TABLE";
      },
    ],
    [
      "number",
      (c: StudioWidgetConfig) => {
        c.display.chartType = "NUMBER";
      },
    ],
  ] as const)("keeps %s edits pending until Run", (_, edit) => {
    const lastRun = initial();
    const draft = structuredClone(lastRun);
    edit(draft);
    draft.title = "Still live";
    expect(hasStudioQueryChanges(draft, lastRun)).toBe(true);
    const rendered = getStudioRenderConfig(lastRun, draft);
    expect(toStudioQueryConfig(rendered)).toEqual(toStudioQueryConfig(lastRun));
    expect(rendered.title).toBe("Still live");
    expect(rendered.queries[0]!.metrics[0]!.label).toBe(
      lastRun.queries[0]!.metrics[0]!.label,
    );
  });
});
