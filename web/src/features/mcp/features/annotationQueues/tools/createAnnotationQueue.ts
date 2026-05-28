import { createAnnotationQueueForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { getMcpPublicApiAuth } from "../../publicApi";

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

          const result = await createAnnotationQueueForApi({
            projectId: context.projectId,
            plan: auth.scope.plan,
            input,
            auditScope: context,
          });

          return CreateAnnotationQueueResponse.parse(result);
        },
      }),
  });
