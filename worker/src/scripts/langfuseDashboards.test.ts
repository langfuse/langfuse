import { describe, expect, it } from "vitest";
import { LANGFUSE_HOME_DASHBOARD } from "@langfuse/shared";
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

    const descriptions = Object.fromEntries(
      langfuseDashboards.dashboards.map((dashboard) => [
        dashboard.id,
        dashboard.description,
      ]),
    );
    expect(descriptions).toMatchObject({
      cmawoi7yd00aqad07f3why08w: "LLM costs.",
      cmawk4ywj00jmad072jn7s0ru: "Latency across traces and generations.",
      cmawln8k700xqad07000k1q8b: "Trace, observation, and score volume.",
      cmtdm68000006ad07dzdb73zw: "Tool calls, errors, and latency.",
    });
    expect(LANGFUSE_HOME_DASHBOARD.description).toBe(
      "Traces, costs, scores, usage, and latency.",
    );
  });

  it("ranks Home, Cost Tracking, then Tool Usage first among templates", () => {
    const updatedAtById = Object.fromEntries(
      langfuseDashboards.dashboards.map((dashboard) => [
        dashboard.id,
        Date.parse(dashboard.updatedAt),
      ]),
    );

    expect(Date.parse(LANGFUSE_HOME_DASHBOARD.updatedAt)).toBeGreaterThan(
      updatedAtById.cmawoi7yd00aqad07f3why08w,
    );
    expect(updatedAtById.cmawoi7yd00aqad07f3why08w).toBeGreaterThan(
      updatedAtById.cmtdm68000006ad07dzdb73zw,
    );
    expect(updatedAtById.cmtdm68000006ad07dzdb73zw).toBeGreaterThan(
      updatedAtById.cmawln8k700xqad07000k1q8b,
    );
    expect(updatedAtById.cmawln8k700xqad07000k1q8b).toBeGreaterThan(
      updatedAtById.cmawk4ywj00jmad072jn7s0ru,
    );
  });
});
