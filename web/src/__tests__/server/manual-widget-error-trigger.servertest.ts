import {
  MANUAL_WIDGET_ERROR_SEARCH_PARAM,
  shouldForceManualWidgetError,
} from "@/src/features/dashboard/server/manual-widget-error-trigger";

describe("shouldForceManualWidgetError", () => {
  it("returns true for non-production requests with the manual error query param", () => {
    expect(
      shouldForceManualWidgetError({
        referer: `http://localhost:3000/project/project-1/dashboards/dashboard-1?${MANUAL_WIDGET_ERROR_SEARCH_PARAM}=1`,
        nodeEnv: "development",
      }),
    ).toBe(true);
  });

  it("accepts truthy string values", () => {
    expect(
      shouldForceManualWidgetError({
        referer: `http://localhost:3000/project/project-1/dashboards/dashboard-1?${MANUAL_WIDGET_ERROR_SEARCH_PARAM}=true`,
        nodeEnv: "test",
      }),
    ).toBe(true);
  });

  it("returns false when the param is missing or malformed", () => {
    expect(
      shouldForceManualWidgetError({
        referer:
          "http://localhost:3000/project/project-1/dashboards/dashboard-1",
        nodeEnv: "development",
      }),
    ).toBe(false);

    expect(
      shouldForceManualWidgetError({
        referer: "not-a-url",
        nodeEnv: "development",
      }),
    ).toBe(false);
  });

  it("returns false in production even when the param is present", () => {
    expect(
      shouldForceManualWidgetError({
        referer: `http://localhost:3000/project/project-1/dashboards/dashboard-1?${MANUAL_WIDGET_ERROR_SEARCH_PARAM}=1`,
        nodeEnv: "production",
      }),
    ).toBe(false);
  });
});
