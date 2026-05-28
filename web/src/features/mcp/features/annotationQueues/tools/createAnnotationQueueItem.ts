import { createAnnotationQueueItemForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { CreateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateAnnotationQueueItemToolSchema } from "../schema";

export const [createAnnotationQueueItemTool, handleCreateAnnotationQueueItem] =
  defineTool({
    name: "createAnnotationQueueItem",
    description:
      "Add an annotation queue item, one trace or observation to review, to a queue.",
    baseSchema: CreateAnnotationQueueItemToolSchema,
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

          return CreateAnnotationQueueItemResponse.parse(result);
        },
      }),
  });
