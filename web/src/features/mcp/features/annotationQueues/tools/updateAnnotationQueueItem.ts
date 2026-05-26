import { AnnotationQueueStatus, LangfuseNotFoundError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { UpdateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  annotationQueueItemToApi,
  UpdateAnnotationQueueItemToolSchema,
} from "../schema";
import { verifyAnnotationQueue } from "../utils";

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

          const item = await prisma.annotationQueueItem.update({
            where: {
              id: input.itemId,
              queueId: input.queueId,
              projectId: context.projectId,
            },
            data: {
              status: input.status,
              completedAt:
                input.status === AnnotationQueueStatus.COMPLETED
                  ? new Date()
                  : undefined,
            },
          });

          await auditLog({
            action: "update",
            resourceType: "annotationQueueItem",
            resourceId: item.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            before: existingItem,
            after: item,
          });

          return UpdateAnnotationQueueItemResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
    destructiveHint: true,
  });
