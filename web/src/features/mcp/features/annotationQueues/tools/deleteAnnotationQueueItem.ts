import { deleteAnnotationQueueItemForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import {
  DeleteAnnotationQueueItemQuery,
  DeleteAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [deleteAnnotationQueueItemTool, handleDeleteAnnotationQueueItem] =
  defineTool({
    name: "deleteAnnotationQueueItem",
    description:
      "Remove an annotation queue item, the queued trace or observation, from a queue.",
    baseSchema: DeleteAnnotationQueueItemQuery,
    inputSchema: DeleteAnnotationQueueItemQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.delete",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          const result = await deleteAnnotationQueueItemForApi({
            projectId: context.projectId,
            queueId: input.queueId,
            itemId: input.itemId,
            auditScope: context,
          });

          return DeleteAnnotationQueueItemResponse.parse(result);
        },
      }),
    destructiveHint: true,
  });
