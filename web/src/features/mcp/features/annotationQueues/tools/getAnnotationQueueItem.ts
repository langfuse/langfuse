import {
  GetAnnotationQueueItemByIdQuery,
  GetAnnotationQueueItemByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { getAnnotationQueueItemForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { defineTool } from "../../../core/define-tool";
import { buildAnnotationQueueItemUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getAnnotationQueueItemTool, handleGetAnnotationQueueItem] =
  defineTool({
    name: "getAnnotationQueueItem",
    description:
      "Get an annotation queue item, one queued trace or observation with review status, by queue ID and item ID.",
    baseSchema: GetAnnotationQueueItemByIdQuery,
    inputSchema: GetAnnotationQueueItemByIdQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.get",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.annotation_queue_item_id": input.itemId,
        },
        fn: async () => {
          const result = await getAnnotationQueueItemForApi({
            projectId: context.projectId,
            queueId: input.queueId,
            itemId: input.itemId,
          });

          const item = GetAnnotationQueueItemByIdResponse.parse(result);

          return {
            ...item,
            url: buildAnnotationQueueItemUrl({
              projectId: context.projectId,
              queueId: item.queueId,
              itemId: item.id,
            }),
          };
        },
      }),
    readOnlyHint: true,
  });
