import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { getAnnotationQueueForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { defineTool } from "../../../core/define-tool";
import { buildAnnotationQueueUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [getAnnotationQueueTool, handleGetAnnotationQueue] = defineTool({
  name: "getAnnotationQueue",
  description:
    "Get an annotation queue, a worklist of trace or observation items for human review and scoring, by ID.",
  baseSchema: GetAnnotationQueueByIdQuery,
  inputSchema: GetAnnotationQueueByIdQuery,
  handler: async (input, context) =>
    runMcpTool({
      spanName: "mcp.annotation_queues.get",
      context,
      attributes: { "mcp.annotation_queue_id": input.queueId },
      fn: async () => {
        const result = await getAnnotationQueueForApi({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        const queue = GetAnnotationQueueByIdResponse.parse(result);

        return {
          ...queue,
          url: buildAnnotationQueueUrl({
            projectId: context.projectId,
            queueId: queue.id,
          }),
        };
      },
    }),
  readOnlyHint: true,
});
