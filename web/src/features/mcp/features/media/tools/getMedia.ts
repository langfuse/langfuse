import { getMedia } from "@/src/features/media/server/mediaService";
import { GetMediaQuerySchema } from "@/src/features/media/validation";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getMediaTool, handleGetMedia] = defineTool({
  name: "getMedia",
  description:
    "Fetch metadata and a signed download URL for one media asset in the current Langfuse project.",
  baseSchema: GetMediaQuerySchema,
  inputSchema: GetMediaQuerySchema,
  handler: async (input, context) => {
    return await runMcpTool({
      spanName: "mcp.media.get",
      context,
      attributes: { "mcp.media_id": input.mediaId },
      fn: async () => {
        return await getMedia({
          projectId: context.projectId,
          mediaId: input.mediaId,
        });
      },
    });
  },
  readOnlyHint: true,
});
