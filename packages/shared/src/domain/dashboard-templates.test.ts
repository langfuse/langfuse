import { describe, expect, it } from "vitest";
import {
  DASHBOARD_TEMPLATE_IDS,
  resolveDashboardTemplate,
} from "./dashboard-templates";
import { LANGFUSE_HOME_DASHBOARD_ID } from "./home-dashboard";

describe("resolveDashboardTemplate", () => {
  it("maps known Langfuse template ids and ignores project dashboards", () => {
    expect(resolveDashboardTemplate(LANGFUSE_HOME_DASHBOARD_ID)).toBe("home");
    expect(resolveDashboardTemplate(DASHBOARD_TEMPLATE_IDS.cost_tracking)).toBe(
      "cost_tracking",
    );
    expect(
      resolveDashboardTemplate(DASHBOARD_TEMPLATE_IDS.latency_tracking),
    ).toBe("latency_tracking");
    expect(
      resolveDashboardTemplate(DASHBOARD_TEMPLATE_IDS.usage_management),
    ).toBe("usage_management");
    expect(resolveDashboardTemplate(DASHBOARD_TEMPLATE_IDS.tool_usage)).toBe(
      "tool_usage",
    );
    expect(resolveDashboardTemplate("cmprojowneddashboardid0001")).toBe(
      undefined,
    );
  });
});
