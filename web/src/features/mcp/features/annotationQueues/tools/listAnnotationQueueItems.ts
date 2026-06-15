import {
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueueItemsResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { listAnnotationQueueItemsForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listAnnotationQueueItemsTool, handleListAnnotationQueueItems] =
  defineTool({
    name: "listAnnotationQueueItems",
    description:
      "List annotation queue items, each linking one trace or observation to a queue with a review status, with optional status filtering.",
    baseSchema: GetAnnotationQueueItemsQuery,
    inputSchema: GetAnnotationQueueItemsQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.list",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        },
        fn: async () => {
          const result = await listAnnotationQueueItemsForApi({
            projectId: context.projectId,
            queueId: input.queueId,
            page: input.page,
            limit: input.limit,
            status: input.status,
          });

          return GetAnnotationQueueItemsResponse.parse(result);
        },
      }),
    readOnlyHint: true,
  });
