import { type FilterState } from "@langfuse/shared";
import { mergeWidgetAndDashboardFilters } from "./utils";

/**
 * LFE-14333: on a dashboard, each widget's query is built from the widget's own
 * filters ANDed with the dashboard-injected global filters (the environment
 * selector, which defaults to hiding `langfuse-*` envs, + the dashboard filter
 * bar). Before the fix, a widget that scoped itself to a `langfuse-*` env got
 * both its own env filter AND the dashboard's env filter — an impossible
 * predicate that returned zero rows and rendered blank on the dashboard while
 * showing fine in the edit screen (which uses only the widget's own filter).
 * The fix: a widget's own environment filter wins.
 */
describe("mergeWidgetAndDashboardFilters", () => {
  const envFilter = (value: string[]): FilterState[number] => ({
    type: "stringOptions",
    column: "environment",
    operator: "any of",
    value,
  });

  it("drops the dashboard's global environment filter when the widget has its own (widget env wins)", () => {
    const widgetFilters: FilterState = [envFilter(["langfuse-llm-as-a-judge"])];
    // Dashboard env selector defaults to production/default (hides langfuse-*).
    const dashboardFilters: FilterState = [
      envFilter(["production", "default"]),
    ];

    const merged = mergeWidgetAndDashboardFilters({
      view: "traces",
      widgetFilters,
      dashboardFilters,
    });

    const envFilters = merged.filter((f) => f.column === "environment");
    // Only the widget's own environment filter survives — no impossible AND.
    expect(envFilters).toHaveLength(1);
    expect(envFilters[0]).toMatchObject({
      column: "environment",
      value: ["langfuse-llm-as-a-judge"],
    });
  });

  it("applies the dashboard's global environment filter when the widget has none (default-hide preserved)", () => {
    const widgetFilters: FilterState = [];
    const dashboardFilters: FilterState = [
      envFilter(["production", "default"]),
    ];

    const merged = mergeWidgetAndDashboardFilters({
      view: "traces",
      widgetFilters,
      dashboardFilters,
    });

    const envFilters = merged.filter((f) => f.column === "environment");
    expect(envFilters).toHaveLength(1);
    expect(envFilters[0]).toMatchObject({
      column: "environment",
      value: ["production", "default"],
    });
  });

  it("keeps non-environment dashboard-global filters even when the widget's env filter wins", () => {
    const widgetFilters: FilterState = [envFilter(["langfuse-eval"])];
    const dashboardFilters: FilterState = [
      envFilter(["production"]),
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["chat"],
      },
    ];

    const merged = mergeWidgetAndDashboardFilters({
      view: "traces",
      widgetFilters,
      dashboardFilters,
    });

    // Widget env wins (dashboard env dropped) but the dashboard's non-env
    // filter still merges in.
    expect(merged.filter((f) => f.column === "environment")).toHaveLength(1);
    expect(
      merged.some((f) => f.column === "name" && f.type === "stringOptions"),
    ).toBe(true);
  });

  it("detects a widget's own env filter stored under the legacy 'Environment' label (mapping normalizes it)", () => {
    // Legacy widgets can persist the environment filter under the uiTable label.
    const widgetFilters: FilterState = [
      {
        type: "stringOptions",
        column: "Environment",
        operator: "any of",
        value: ["langfuse-eval"],
      },
    ];
    const dashboardFilters: FilterState = [
      envFilter(["production", "default"]),
    ];

    const merged = mergeWidgetAndDashboardFilters({
      view: "traces",
      widgetFilters,
      dashboardFilters,
    });

    const envFilters = merged.filter((f) => f.column === "environment");
    // The legacy label is normalized to the canonical `environment` column and
    // wins over the dashboard selector.
    expect(envFilters).toHaveLength(1);
    expect(envFilters[0]).toMatchObject({ value: ["langfuse-eval"] });
  });

  it("leaves both filter sets untouched when neither declares an environment filter", () => {
    const widgetFilters: FilterState = [
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["chat"],
      },
    ];
    const dashboardFilters: FilterState = [
      {
        type: "string",
        column: "userId",
        operator: "=",
        value: "u1",
      },
    ];

    const merged = mergeWidgetAndDashboardFilters({
      view: "traces",
      widgetFilters,
      dashboardFilters,
    });

    expect(merged).toHaveLength(2);
    expect(merged.filter((f) => f.column === "environment")).toHaveLength(0);
  });
});
