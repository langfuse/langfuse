import { describe, expect, it } from "vitest";
import { DASHBOARD_TEMPLATE_IDS } from "@langfuse/shared";
import { dashboardTemplateProps } from "./dashboardTemplateProps";

describe("dashboardTemplateProps", () => {
  it("emits dashboardTemplate only for known Langfuse template ids", () => {
    expect(
      dashboardTemplateProps(DASHBOARD_TEMPLATE_IDS.cost_tracking),
    ).toEqual({ dashboardTemplate: "cost_tracking" });
    expect(dashboardTemplateProps("cmprojowneddashboardid0001")).toEqual({});
    expect(dashboardTemplateProps("")).toEqual({});
  });
});
