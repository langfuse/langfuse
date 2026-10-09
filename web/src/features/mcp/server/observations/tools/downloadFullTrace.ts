import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createExportDownload } from "../export-download";

const DownloadFullTraceSchema = z.object({ traceId: z.string().min(1) });

export const [downloadFullTraceTool, handleDownloadFullTrace] = defineTool({
  name: "downloadFullTrace",
  description:
    "Returns a secret, 5-minute URL for trace JSON (observations with full input/output/tool calls/metadata and scores). Save to disk for local search without filling context. Limit at 350 observations per trace.",
  action: "traces:read",
  baseSchema: DownloadFullTraceSchema,
  inputSchema: DownloadFullTraceSchema,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.observations.downloadFullTrace",
      context,
      fn: () => createExportDownload(input, context),
    }),
  readOnlyHint: true,
});
