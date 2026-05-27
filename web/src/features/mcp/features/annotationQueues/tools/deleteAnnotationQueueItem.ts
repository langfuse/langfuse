import { LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  DeleteAnnotationQueueItemQuery,
  DeleteAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { verifyAnnotationQueue } from "../utils";

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
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const existingItem = await prisma.annotationQueueItem.findUnique({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          if (!existingItem) {
            throw new LangfuseNotFoundError("Annotation queue item not found");
          }

          await prisma.annotationQueueItem.delete({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
          });

          await auditLog({
            action: "delete",
            resourceType: "annotationQueueItem",
            resourceId: existingItem.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: existingItem,
          });

          return DeleteAnnotationQueueItemResponse.parse({
            success: true,
            message: "Annotation queue item deleted successfully",
          });
        },
      }),
    destructiveHint: true,
  });
