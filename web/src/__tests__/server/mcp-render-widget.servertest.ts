import {
  createOrgProjectAndApiKey,
  DashboardService,
} from "@langfuse/shared/src/server";
import { v4 as uuidv4 } from "uuid";
import { handleRenderWidget } from "@/src/features/mcp/server/apps/tools/renderWidget";
import { type AppToolResult } from "@/src/features/mcp/core/mcp-app";
import { type WidgetPayload } from "@/src/features/mcp/core/widget-payload";
import {
  createDashboardWidgetTool,
  handleCreateDashboardWidget,
} from "@/src/features/mcp/server/dashboardWidgets/tools/createDashboardWidget";
import {
  updateDashboardWidgetTool,
  handleUpdateDashboardWidget,
} from "@/src/features/mcp/server/dashboardWidgets/tools/dashboardCrud";
import { mockServerContext } from "./mcp-helpers";

describe("renderWidget", () => {
  it("renders saved Markdown without querying its classic projection", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const { widget } = await DashboardService.saveWidgetDefinition(projectId, {
      definition: {
        kind: "markdown",
        config: {
          version: 1,
          title: "Explanation",
          content: "Read this context",
        },
      },
    });
    const result = (await handleRenderWidget(
      { widgetId: widget.id },
      mockServerContext({ projectId }),
    )) as AppToolResult;
    expect(JSON.parse(result.text).markdown).toBe("Read this context");
    expect((result.meta.widget as WidgetPayload).rich?.definition).toEqual(
      widget.definition,
    );
    expect((result.meta.widget as WidgetPayload).rows).toEqual([]);
    const definition = (result.meta.widget as WidgetPayload).rich!.definition;
    const adHoc = (await handleRenderWidget(
      { definition },
      mockServerContext({ projectId }),
    )) as AppToolResult;
    expect(JSON.parse(adHoc.text).markdown).toBe("Read this context");
    expect(createDashboardWidgetTool.inputSchema.properties).toHaveProperty(
      "definition",
    );
    expect(updateDashboardWidgetTool.inputSchema.properties).toHaveProperty(
      "definition",
    );
    await expect(
      handleCreateDashboardWidget(
        {
          name: "Explanation",
          description: "",
          view: "observations",
          metrics: [{ measure: "count", agg: "count" }],
          dimensions: [],
          filters: [],
          chartType: "NUMBER",
          definition,
        },
        mockServerContext({ projectId }),
      ),
    ).rejects.toThrow("opted-in employee");
    await expect(
      handleUpdateDashboardWidget(
        { widgetId: widget.id, definition },
        mockServerContext({ projectId }),
      ),
    ).rejects.toThrow("opted-in employee");
  });

  it("renders named tabs and computes formulas from the same operands as the dashboard", async () => {
    const { projectId } = await createOrgProjectAndApiKey();
    const query = {
      id: "a",
      label: "Observations",
      view: "observations" as const,
      metrics: [
        { id: "count", measure: "count", aggregation: "count" as const },
      ],
      dimensions: [],
      filters: [],
    };
    const { widget } = await DashboardService.saveWidgetDefinition(projectId, {
      definition: {
        kind: "multiQuery",
        config: {
          version: 2,
          title: "Operations",
          description: "Two views",
          tabs: [
            {
              id: "count",
              label: "Observations plus 100",
              queries: [{ ...query, hidden: true }],
              display: { chartType: "NUMBER" },
              formulas: [
                {
                  id: "f",
                  label: "",
                  expression: "a.count + 100",
                  format: "number",
                },
              ],
            },
            {
              id: "traces",
              label: "Traces",
              queries: [{ ...query, label: "Traces", view: "traces" }],
              display: { chartType: "VERTICAL_BAR" },
            },
            {
              id: "scores",
              label: "All score records",
              queries: [
                {
                  ...query,
                  label: "Scores",
                  view: "scores-numeric",
                  homeScoreAggregate: true,
                  metrics: [
                    { id: "count", measure: "count", aggregation: "sum" },
                  ],
                },
              ],
              display: { chartType: "NUMBER" },
            },
          ],
        },
      },
    });
    const context = mockServerContext({ projectId });
    const result = (await handleRenderWidget(
      { widgetId: widget.id },
      context,
    )) as AppToolResult;
    const payload = result.meta.widget as WidgetPayload;
    expect(payload.rich?.activeTabId).toBe("count");
    expect(
      new URL(JSON.parse(result.text).url).searchParams.get("dateRange"),
    ).toBe(
      `${new Date(payload.rich!.from).getTime()}-${new Date(payload.rich!.to).getTime()}`,
    );
    expect(payload.rich?.result?.status).toBe("complete");
    expect(payload.rich?.result?.values[0]?.value).toBe(0);
    const adHoc = (await handleRenderWidget(
      { definition: payload.rich!.definition },
      context,
    )) as AppToolResult;
    expect(JSON.parse(adHoc.text).values[0].value).toBe(100);
    expect(JSON.parse(result.text).values).toEqual([
      expect.objectContaining({ series: "Observations + 100", value: 100 }),
    ]);
    const second = (await handleRenderWidget(
      { widgetId: widget.id, tabId: "traces" },
      context,
    )) as AppToolResult;
    expect((second.meta.widget as WidgetPayload).rich?.activeTabId).toBe(
      "traces",
    );
    expect(JSON.parse(second.text).tab).toBe("Traces");
    expect(new URL(JSON.parse(second.text).url).searchParams.get("tabId")).toBe(
      "traces",
    );
    expect(new URL(JSON.parse(result.text).url).searchParams.get("tabId")).toBe(
      "count",
    );
    const scores = (await handleRenderWidget(
      { widgetId: widget.id, tabId: "scores" },
      context,
    )) as AppToolResult;
    expect((scores.meta.widget as WidgetPayload).rich?.result?.status).toBe(
      "complete",
    );
    expect(JSON.parse(scores.text).values[0].value).toBe(0);
    await expect(
      handleRenderWidget({ widgetId: widget.id, tabId: "missing" }, context),
    ).rejects.toThrow("tab no longer exists");
    await expect(
      handleRenderWidget(
        { widgetId: widget.id },
        mockServerContext({ projectId: uuidv4() }),
      ),
    ).rejects.toThrow("not found");
  });

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

    const summary = JSON.parse(result.text) as {
      from: string;
      to: string;
      url: string;
    };
    expect(new URL(summary.url).searchParams.get("dateRange")).toBe(
      `${new Date(fromTimestamp).getTime()}-${new Date(toTimestamp).getTime()}`,
    );
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
