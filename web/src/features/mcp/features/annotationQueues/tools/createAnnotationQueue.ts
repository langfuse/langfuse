import { InvalidRequestError, MethodNotAllowedError } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";
import { annotationQueueToApi } from "../schema";

export const [createAnnotationQueueTool, handleCreateAnnotationQueue] =
  defineTool({
    name: "createAnnotationQueue",
    description:
      "Create an annotation queue, a worklist that collects trace or observation items for human review and scoring.",
    baseSchema: CreateAnnotationQueueBody,
    inputSchema: CreateAnnotationQueueBody,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queues.create",
        context,
        attributes: { "mcp.annotation_queue_name": input.name },
        fn: async () => {
          const auth = await getMcpPublicApiAuth(context);

          if (auth.scope.plan === "cloud:hobby") {
            const queueCount = await prisma.annotationQueue.count({
              where: { projectId: context.projectId },
            });

            if (queueCount >= 1) {
              throw new MethodNotAllowedError(
                "Maximum number of annotation queues reached on Hobby plan.",
              );
            }
          }

          const existingQueue = await prisma.annotationQueue.findFirst({
            where: {
              projectId: context.projectId,
              name: input.name,
            },
          });

          if (existingQueue) {
            throw new InvalidRequestError(
              "A queue with this name already exists.",
            );
          }

          const scoreConfigs = await prisma.scoreConfig.findMany({
            where: {
              id: { in: input.scoreConfigIds },
              projectId: context.projectId,
            },
            select: { id: true },
          });
          const scoreConfigIdSet = new Set(
            scoreConfigs.map((config) => config.id),
          );

          if (input.scoreConfigIds.some((id) => !scoreConfigIdSet.has(id))) {
            throw new InvalidRequestError(
              "At least one of the score config IDs cannot be found for the given project.",
            );
          }

          const queue = await prisma.annotationQueue.create({
            data: {
              projectId: context.projectId,
              name: input.name,
              description: input.description,
              scoreConfigIds: input.scoreConfigIds,
            },
          });

          await auditLog({
            action: "create",
            resourceType: "annotationQueue",
            resourceId: queue.id,
            projectId: context.projectId,
            orgId: context.orgId,
            apiKeyId: context.apiKeyId,
            after: queue,
          });

          return CreateAnnotationQueueResponse.parse(
            annotationQueueToApi(queue),
          );
        },
      }),
  });
