import { deleteAnnotationQueueAssignmentForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { DeleteAnnotationQueueAssignmentResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { DeleteAnnotationQueueAssignmentToolSchema } from "../schema";

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
        const result = await deleteAnnotationQueueAssignmentForApi({
          projectId: context.projectId,
          queueId: input.queueId,
          input: { userId: input.userId },
          auditScope: context,
        });

        return DeleteAnnotationQueueAssignmentResponse.parse(result.response);
      },
    }),
  destructiveHint: true,
});
