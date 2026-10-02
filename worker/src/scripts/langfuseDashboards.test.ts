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
});
