import { AnnotationQueueStatus } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreateAnnotationQueueItemResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import {
  annotationQueueItemToApi,
  CreateAnnotationQueueItemToolSchema,
} from "../schema";
import { verifyAnnotationQueue } from "../utils";

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
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const status = input.status || AnnotationQueueStatus.PENDING;
          const completedAt =
            status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

          const item = await prisma.annotationQueueItem.create({
            data: {
              queueId: input.queueId,
              objectId: input.objectId,
              objectType: input.objectType,
              status,
              completedAt,
              projectId: context.projectId,
            },
          });

          await auditLog({
            action: "create",
            resourceType: "annotationQueueItem",
            resourceId: item.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: item,
          });

          return CreateAnnotationQueueItemResponse.parse(
            annotationQueueItemToApi(item),
          );
        },
      }),
  });
