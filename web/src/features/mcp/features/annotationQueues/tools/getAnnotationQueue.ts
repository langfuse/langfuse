import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { annotationQueueToApi } from "../schema";
import { verifyAnnotationQueue } from "../utils";

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
        const queue = await verifyAnnotationQueue({
          projectId: context.projectId,
          queueId: input.queueId,
        });

        return GetAnnotationQueueByIdResponse.parse(
          annotationQueueToApi(queue),
        );
      },
    }),
  readOnlyHint: true,
});
