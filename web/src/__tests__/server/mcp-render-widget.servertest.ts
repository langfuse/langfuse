import { v4 as uuidv4 } from "uuid";
import { handleRenderWidget } from "@/src/features/mcp/server/apps/tools/renderWidget";
import { type AppToolResult } from "@/src/features/mcp/core/mcp-app";
import { type WidgetPayload } from "@/src/features/mcp/core/widget-payload";
import { mockServerContext } from "./mcp-helpers";

describe("renderWidget", () => {
  it("queries a custom from/to window instead of a relative range", async () => {
    const fromTimestamp = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const toTimestamp = new Date(Date.now() - 86_400_000).toISOString();

    const result = (await handleRenderWidget(
      {
        view: "observations",
        metrics: [{ measure: "count", agg: "count" }],
        timeRange: "30d",
        fromTimestamp,
        toTimestamp,
      },
      mockServerContext({ projectId: uuidv4() }),
    )) as AppToolResult;

    const summary = JSON.parse(result.text) as { from: string; to: string };
    expect({ from: summary.from, to: summary.to }).toEqual({
      from: fromTimestamp,
      to: toTimestamp,
    });
    expect((result.meta.widget as WidgetPayload).timeRange).toEqual({
      from: fromTimestamp,
      to: toTimestamp,
    });
  });
});
