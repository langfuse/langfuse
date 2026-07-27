import { MonitorService } from "@langfuse/shared/monitors/server";
import { z } from "zod";

import { buildMonitorUrl } from "@/src/utils/product-url";

import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

const GetMonitorInputSchema = z.object({
  monitorId: z.string().describe("ID of the monitor to retrieve."),
});

export const [getMonitorTool, handleGetMonitor] = defineTool({
  name: "getMonitor",
  description: "Get a monitor by ID.",
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
  readOnlyHint: true,
});
