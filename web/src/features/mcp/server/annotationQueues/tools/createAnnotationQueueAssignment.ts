import { createAnnotationQueueAssignmentForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { CreateAnnotationQueueAssignmentResponse } from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { CreateAnnotationQueueAssignmentToolSchema } from "../schema";

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
        const { assignment } = await createAnnotationQueueAssignmentForApi({
          projectId: context.projectId,
          orgId: context.orgId,
          queueId: input.queueId,
          input: { userId: input.userId },
          auditScope: context,
        });

        return CreateAnnotationQueueAssignmentResponse.parse(assignment);
      },
    }),
});
