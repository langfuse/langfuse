import { type FilterState } from "@langfuse/shared";
import { mapLegacyUiTableFilterToView } from "@/src/features/dashboard/lib/dashboardUiTableToViewMapping";
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

  // The override is column-only and operator-agnostic: presence of ANY
  // environment filter on the widget triggers dropping ALL dashboard-global
  // environment filters. These fixtures lock that contract.
  describe("column-only, operator-agnostic contract", () => {
    it("detects a widget env filter regardless of operator (e.g. 'none of')", () => {
      const widgetFilters: FilterState = [
        {
          type: "stringOptions",
          column: "environment",
          operator: "none of",
          value: ["langfuse-eval"],
        },
      ];
      const dashboardFilters: FilterState = [envFilter(["production"])];

      const merged = mergeWidgetAndDashboardFilters({
        view: "traces",
        widgetFilters,
        dashboardFilters,
      });

      const envFilters = merged.filter((f) => f.column === "environment");
      expect(envFilters).toHaveLength(1);
      expect(envFilters[0]).toMatchObject({
        operator: "none of",
        value: ["langfuse-eval"],
      });
    });

    it("drops ALL dashboard env filters and keeps ALL widget env filters when either side has multiple", () => {
      const widgetFilters: FilterState = [
        envFilter(["langfuse-a"]),
        envFilter(["langfuse-b"]),
      ];
      const dashboardFilters: FilterState = [
        envFilter(["production"]),
        envFilter(["default"]),
      ];

      const merged = mergeWidgetAndDashboardFilters({
        view: "traces",
        widgetFilters,
        dashboardFilters,
      });

      const envFilters = merged.filter((f) => f.column === "environment");
      // Both of the widget's env filters survive; neither dashboard env filter does.
      expect(envFilters).toHaveLength(2);
      expect(envFilters.map((f) => f.value)).toEqual([
        ["langfuse-a"],
        ["langfuse-b"],
      ]);
    });

    it("still drops the dashboard env filter when widget and dashboard env are identical (no duplicate)", () => {
      const widgetFilters: FilterState = [envFilter(["production"])];
      const dashboardFilters: FilterState = [envFilter(["production"])];

      const merged = mergeWidgetAndDashboardFilters({
        view: "traces",
        widgetFilters,
        dashboardFilters,
      });

      const envFilters = merged.filter((f) => f.column === "environment");
      // Widget wins → exactly one env filter, not a redundant AND of two equal ones.
      expect(envFilters).toHaveLength(1);
      expect(envFilters[0]).toMatchObject({ value: ["production"] });
    });
  });

  // "View as table" deep-link safety (LFE-14333 nit): DashboardWidget feeds the
  // helper's output into buildTableFilterHref, which maps to view space AGAIN.
  // That re-map must be a no-op on the helper's already-view-space output, or
  // the generated href would double-map / drop filters. Proven here directly.
  it("returns view-space filters that are idempotent under a second mapLegacyUiTableFilterToView (buildTableFilterHref re-map is safe)", () => {
    const widgetFilters: FilterState = [
      // Legacy label on the widget side to force a real first-pass remap.
      {
        type: "stringOptions",
        column: "Environment",
        operator: "any of",
        value: ["langfuse-eval"],
      },
    ];
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
    const remapped = mapLegacyUiTableFilterToView("traces", merged);

    // buildTableFilterHref's internal remap changes nothing.
    expect(remapped).toEqual(merged);
    // And the deep-link carries exactly one (the widget's) environment filter.
    expect(remapped.filter((f) => f.column === "environment")).toHaveLength(1);
    expect(remapped.find((f) => f.column === "environment")).toMatchObject({
      value: ["langfuse-eval"],
    });
  });
});
