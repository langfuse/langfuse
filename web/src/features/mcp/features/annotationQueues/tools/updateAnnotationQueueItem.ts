import { updateAnnotationQueueItemForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { UpdateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { UpdateAnnotationQueueItemToolSchema } from "../schema";

export const [updateAnnotationQueueItemTool, handleUpdateAnnotationQueueItem] =
  defineTool({
    name: "updateAnnotationQueueItem",
    description:
      "Update an annotation queue item's review status, such as pending or completed.",
    baseSchema: UpdateAnnotationQueueItemToolSchema,
    inputSchema: UpdateAnnotationQueueItemToolSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.update",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          const result = await updateAnnotationQueueItemForApi({
            projectId: context.projectId,
            queueId: input.queueId,
            itemId: input.itemId,
            input,
            auditScope: context,
          });

          return UpdateAnnotationQueueItemResponse.parse(result);
        },
      }),
    destructiveHint: true,
  });
