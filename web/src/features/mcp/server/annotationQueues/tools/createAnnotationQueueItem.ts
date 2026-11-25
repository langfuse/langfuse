import { createAnnotationQueueItemForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { CreateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { buildAnnotationQueueItemUrl } from "@langfuse/shared/src/server";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  CreateAnnotationQueueItemToolBaseSchema,
  CreateAnnotationQueueItemToolSchema,
} from "../schema";

export const [createAnnotationQueueItemTool, handleCreateAnnotationQueueItem] =
  defineTool({
    name: "createAnnotationQueueItem",
    description:
      "Add one trace, observation, or session to an annotation queue for review and return the item. For several, use batchCreateAnnotationQueueItems.",
    action: "annotationQueues:CUD",
    baseSchema: CreateAnnotationQueueItemToolBaseSchema,
    inputSchema: CreateAnnotationQueueItemToolSchema,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.create",
        context,
        attributes: { "mcp.annotation_queue_id": input.queueId },
        fn: async () => {
          const result = await createAnnotationQueueItemForApi({
            projectId: context.projectId,
            queueId: input.queueId,
            input,
            auditScope: context,
          });

          const item = CreateAnnotationQueueItemResponse.parse(result);

          return {
            ...item,
            url: buildAnnotationQueueItemUrl({
              projectId: context.projectId,
              queueId: input.queueId,
              itemId: item.id,
            }),
          };
        },
      }),
    annotations: { destructiveHint: false },
  });
