import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  GetAnnotationQueueItemByIdQuery,
  GetAnnotationQueueItemByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { annotationQueueItemToApi } from "../schema";
import { verifyAnnotationQueue } from "../utils";

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
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const item = await prisma.annotationQueueItem.findUnique({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          if (!item) {
            throw new LangfuseNotFoundError("Annotation queue item not found");
          }

          return GetAnnotationQueueItemByIdResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
    readOnlyHint: true,
  });
