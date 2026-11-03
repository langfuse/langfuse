import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createExportDownload } from "../export-download";

const DownloadFullTraceSchema = z.object({ traceId: z.string().min(1) });

export const [downloadFullTraceTool, handleDownloadFullTrace] = defineTool({
  name: "downloadFullTrace",
  description:
    "Returns a URL for trace JSON (observations and scores), valid for 5 minutes. Save to disk for local search without filling context. Or pass the link to other MCP tools. At 350+ observations, input/output, metadata and tool definitions/calls are omitted.",
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
