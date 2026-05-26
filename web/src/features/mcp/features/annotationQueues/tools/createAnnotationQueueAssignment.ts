import {
  LangfuseNotFoundError,
  Prisma as SharedPrisma,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { getUserProjectRoles } from "@langfuse/shared/src/server";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { CreateAnnotationQueueAssignmentResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateAnnotationQueueAssignmentToolSchema } from "../schema";
import { verifyAnnotationQueue } from "../utils";

export const [
  createAnnotationQueueAssignmentTool,
  handleCreateAnnotationQueueAssignment,
] = defineTool({
  name: "createAnnotationQueueAssignment",
  description:
    "Assign a project user to an annotation queue so they can work through its review items.",
  baseSchema: CreateAnnotationQueueAssignmentToolSchema,
  inputSchema: CreateAnnotationQueueAssignmentToolSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.annotation_queue_assignments.create",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        const user = await getUserProjectRoles({
          projectId: context.projectId,
          orgId: context.orgId,
          filterCondition: [
            {
              column: "userId",
              operator: "any of",
              value: [input.userId],
              type: "stringOptions",
            },
          ],
          searchFilter: SharedPrisma.empty,
          limit: 1,
          page: 0,
          orderBy: SharedPrisma.empty,
        });

        if (!user || user.length === 0) {
          throw new LangfuseNotFoundError(
            "User not found or not authorized for this project",
          );
        }

        const assignmentWhere = {
          projectId: context.projectId,
          queueId: input.queueId,
          userId: input.userId,
        };

        const createResult = await prisma.annotationQueueAssignment.createMany({
          data: [assignmentWhere],
          skipDuplicates: true,
        });

        if (createResult.count === 0) {
          return CreateAnnotationQueueAssignmentResponse.parse({
            userId: input.userId,
            projectId: context.projectId,
            queueId: input.queueId,
          });
        }

        const assignment =
          await prisma.annotationQueueAssignment.findUniqueOrThrow({
            where: {
              projectId_queueId_userId: assignmentWhere,
            },
          });

        await auditLog({
          action: "create",
          resourceType: "annotationQueueAssignment",
          resourceId: assignment.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          after: assignment,
        });

        return CreateAnnotationQueueAssignmentResponse.parse({
          userId: input.userId,
          projectId: context.projectId,
          queueId: input.queueId,
        });
      },
    }),
});
