import { z } from "zod";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { createExportDownload } from "../export-download";

const ExportObservationSchema = z.object({
  observationId: z.string().min(1),
});

export const [exportObservationTool, handleExportObservation] = defineTool({
  name: "exportObservation",
  description: [
    "Get a five-minute JSON download URL for one observation and its scores in the current project by observation ID.",
    "Download the URL directly to a local file with an HTTP client (for example curl --fail --output observation.json URL), then search locally. The payload stays out of model context. No authorization header is needed for the download; treat the URL as a secret.",
    "Selects the observation from its trace's UI Download JSON export. The parent trace's size limit, observation cap and large-field omissions still apply: at 350 or more observations, input, output, metadata, toolDefinitions and toolCalls are omitted. Descendants are not included. The download fails if the observation is absent from the bounded trace export. Data is read when the URL is downloaded.",
  ].join("\n"),
  action: "traces:read",
  baseSchema: ExportObservationSchema,
  inputSchema: ExportObservationSchema,
  handler: (input, context) =>
    runMcpTool({
      spanName: "mcp.observations.exportObservation",
      context,
      fn: () => createExportDownload(input, context),
    }),
  readOnlyHint: true,
});
