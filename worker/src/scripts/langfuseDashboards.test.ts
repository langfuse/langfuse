import { describe, expect, it } from "vitest";
import langfuseDashboards from "../constants/langfuse-dashboards.json";

describe("langfuse template dashboards", () => {
  it("ranks Top 20 Called Tools by per-tool invocations, not observation count", () => {
    const widget = langfuseDashboards.widgets.find(
      (entry) => entry.name === "Top 20 Called Tools",
    );

    expect(widget).toMatchObject({
      view: "OBSERVATIONS",
      dimensions: [{ field: "calledToolNames" }],
      metrics: [{ agg: "sum", measure: "toolCallInvocations" }],
    });
    expect(widget?.description).not.toMatch(/observations that called/i);
  });

  it("uses the short template dashboard titles", () => {
    const titles = Object.fromEntries(
      langfuseDashboards.dashboards.map((dashboard) => [
        dashboard.id,
        dashboard.name,
      ]),
    );

    expect(titles).toMatchObject({
      cmawoi7yd00aqad07f3why08w: "Cost Tracking",
      cmawk4ywj00jmad072jn7s0ru: "Latency Tracking",
      cmawln8k700xqad07000k1q8b: "Usage Management",
      cmtdm68000006ad07dzdb73zw: "Tool Usage",
    });
  });
});
