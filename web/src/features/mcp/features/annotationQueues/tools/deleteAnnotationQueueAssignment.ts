import { Prisma as SharedPrisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { DeleteAnnotationQueueAssignmentResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { DeleteAnnotationQueueAssignmentToolSchema } from "../schema";
import { verifyAnnotationQueue } from "../utils";

export const [
  deleteAnnotationQueueAssignmentTool,
  handleDeleteAnnotationQueueAssignment,
] = defineTool({
  name: "deleteAnnotationQueueAssignment",
  description: "Remove a project user's assignment from an annotation queue.",
  baseSchema: DeleteAnnotationQueueAssignmentToolSchema,
  inputSchema: DeleteAnnotationQueueAssignmentToolSchema,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.annotation_queue_assignments.delete",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        let assignment;
        try {
          assignment = await prisma.annotationQueueAssignment.delete({
            where: {
              projectId_queueId_userId: {
                projectId: context.projectId,
                queueId: input.queueId,
                userId: input.userId,
              },
            },
          });
        } catch (error) {
          if (
            error instanceof SharedPrisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ) {
            return DeleteAnnotationQueueAssignmentResponse.parse({
              success: true,
            });
          }

          throw error;
        }

        await auditLog({
          action: "delete",
          resourceType: "annotationQueueAssignment",
          resourceId: assignment.id,
          projectId: context.projectId,
          orgId: context.orgId,
          apiKeyId: context.apiKeyId,
          before: assignment,
        });

        return DeleteAnnotationQueueAssignmentResponse.parse({
          success: true,
        });
      },
    }),
  destructiveHint: true,
});
