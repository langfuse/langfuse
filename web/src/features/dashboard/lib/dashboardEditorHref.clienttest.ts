import { describe, expect, it } from "vitest";
import { buildDashboardEditorHref } from "./dashboardEditorHref";

describe("dashboard editor navigation", () => {
  it("preserves the exact range and URL scope for dashboard, chart and text editing", () => {
    const absoluteRange = "1787097600000-1794873659999";
    const query = {
      projectId: "project",
      dashboardId: "dashboard",
      dateRange: absoluteRange,
      environment: ["production", "staging"],
      filter: "traceName;=;example",
      edit: "previous-widget",
      addWidgetId: "previous-action",
    };
    for (const editId of [undefined, "chart-widget", "text-widget"]) {
      const href = buildDashboardEditorHref({
        projectId: "project",
        dashboardId: "dashboard",
        query,
        editId,
        fallbackDateRange: "90d",
      });
      const url = new URL(href, "http://localhost");
      expect(url.pathname).toBe("/project/project/dashboards/dashboard/studio");
      expect(url.searchParams.get("dateRange")).toBe(absoluteRange);
      expect(url.searchParams.getAll("environment")).toEqual([
        "production",
        "staging",
      ]);
      expect(url.searchParams.get("filter")).toBe(query.filter);
      expect(url.searchParams.get("edit")).toBe(editId ?? null);
      expect(url.searchParams.has("projectId")).toBe(false);
      expect(url.searchParams.has("dashboardId")).toBe(false);
      expect(url.searchParams.has("addWidgetId")).toBe(false);
    }
    const fallback = new URL(
      buildDashboardEditorHref({
        projectId: "project",
        dashboardId: "dashboard",
        query: {},
        fallbackDateRange: absoluteRange,
        editId: "chart-widget",
      }),
      "http://localhost",
    );
    expect(fallback.searchParams.get("dateRange")).toBe(absoluteRange);
    expect(query.edit).toBe("previous-widget");
  });
});
