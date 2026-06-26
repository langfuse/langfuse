import { describe, expect, it } from "vitest";

import {
  DashboardWidgetChartTypeSchema,
  DashboardWidgetViewsSchema,
} from "./types";

describe("DashboardService schema enums", () => {
  it("pins dashboard widget views", () => {
    expect(DashboardWidgetViewsSchema.options).toEqual([
      "TRACES",
      "OBSERVATIONS",
      "SCORES_NUMERIC",
      "SCORES_CATEGORICAL",
    ]);
  });

  it("pins dashboard widget chart types", () => {
    expect(DashboardWidgetChartTypeSchema.options).toEqual([
      "LINE_TIME_SERIES",
      "AREA_TIME_SERIES",
      "BAR_TIME_SERIES",
      "HORIZONTAL_BAR",
      "VERTICAL_BAR",
      "PIE",
      "NUMBER",
      "HISTOGRAM",
      "PIVOT_TABLE",
    ]);
  });
});
