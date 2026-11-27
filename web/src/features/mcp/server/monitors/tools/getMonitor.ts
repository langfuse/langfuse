import { MonitorService } from "@langfuse/shared/monitors/server";
import { z } from "zod";

import { buildMonitorUrl } from "@langfuse/shared/src/server";

import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetMonitorInputSchema = z.object({
  monitorId: z.string().describe("The alert `id` from listAlerts."),
});

export const [getMonitorTool, handleGetMonitor] = defineTool({
  name: "getAlert",
  description:
    "Get one alert (monitor): its metric query (view, filters, metric), window, threshold operator, warning and alert thresholds, no-data and renotify settings, tags, trigger ids, current severity and status, and UI url.",
  action: "alerts:read",
  baseSchema: GetMonitorInputSchema,
  inputSchema: GetMonitorInputSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.monitors.get",
      context,
      attributes: { "mcp.monitor_id": input.monitorId },
      fn: async () => {
        const monitor = await MonitorService.getById(
          { userId: context.userId ?? context.apiKeyId },
          {
            projectId: context.projectId,
            id: input.monitorId,
          },
        );

        return {
          ...monitor,
          url: buildMonitorUrl({
            projectId: context.projectId,
            monitorId: monitor.id,
          }),
        };
      },
    }),
  annotations: { readOnlyHint: true },
});
