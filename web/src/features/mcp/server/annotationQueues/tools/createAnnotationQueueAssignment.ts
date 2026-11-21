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
    "Assign a project user to an annotation queue as a reviewer and return the assignment. Re-assigning an assigned user has no effect. Fails if the queue or user is not found or the user lacks project access.",
  action: "annotationQueueAssignments:CUD",
  baseSchema: CreateAnnotationQueueAssignmentToolSchema,
  inputSchema: CreateAnnotationQueueAssignmentToolSchema,
  readOnlyHint: false,
  destructiveHint: false,
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
