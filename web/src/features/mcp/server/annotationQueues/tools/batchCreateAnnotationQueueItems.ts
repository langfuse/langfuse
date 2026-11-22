import { createAnnotationQueueItemsForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { CreateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { buildAnnotationQueueItemUrl } from "@langfuse/shared/src/server";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  BatchCreateAnnotationQueueItemsToolSchema,
  MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS,
} from "../schema";

export const [
  batchCreateAnnotationQueueItemsTool,
  handleBatchCreateAnnotationQueueItems,
] = defineTool({
  name: "batchCreateAnnotationQueueItems",
  description: `Add up to ${MAX_BATCH_CREATE_ANNOTATION_QUEUE_ITEMS} annotation queue items, traces or observations to review, to one queue. Either all items are added or none.`,
  action: "annotationQueues:CUD",
  baseSchema: BatchCreateAnnotationQueueItemsToolSchema,
  inputSchema: BatchCreateAnnotationQueueItemsToolSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.annotation_queue_items.batch_create",
      context,
      attributes: {
        "mcp.annotation_queue_id": input.queueId,
        "mcp.annotation_queue_item_count": input.items.length,
      },
      fn: async () => {
        const items = await createAnnotationQueueItemsForApi({
          projectId: context.projectId,
          queueId: input.queueId,
          inputs: input.items,
          auditScope: context,
        });

        return {
          data: items.map((result) => {
            const item = CreateAnnotationQueueItemResponse.parse(result);

            return {
              ...item,
              url: buildAnnotationQueueItemUrl({
                projectId: context.projectId,
                queueId: input.queueId,
                itemId: item.id,
              }),
            };
          }),
        };
      },
    }),
});
