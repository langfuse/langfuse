import { SpanKind } from "@opentelemetry/api";

import { getMedia } from "@/src/features/media/server/mediaService";
import { GetMediaQuerySchema } from "@/src/features/media/validation";
import { instrumentAsync } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";

export const [getMediaTool, handleGetMedia] = defineTool({
  name: "getMedia",
  description:
    "Fetch metadata and a signed download URL for one media asset in the current Langfuse project.",
  baseSchema: GetMediaQuerySchema,
  inputSchema: GetMediaQuerySchema,
  handler: async (input, context) => {
    return await instrumentAsync(
      { name: "mcp.media.get", spanKind: SpanKind.INTERNAL },
      async (span) => {
        span.setAttributes({
          "langfuse.project.id": context.projectId,
          "langfuse.org.id": context.orgId,
          "mcp.api_key_id": context.apiKeyId,
          "mcp.media_id": input.mediaId,
        });

        return await getMedia({
          projectId: context.projectId,
          mediaId: input.mediaId,
        });
      },
    );
  },
  readOnlyHint: true,
});
