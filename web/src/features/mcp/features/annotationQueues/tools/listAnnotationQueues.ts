import {
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { listAnnotationQueuesForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";
import { defineTool } from "../../../core/define-tool";
import { buildAnnotationQueueUrl } from "@/src/utils/product-url";
import { runMcpTool } from "../../../core/run-mcp-tool";

export const [listAnnotationQueuesTool, handleListAnnotationQueues] =
  defineTool({
    name: "listAnnotationQueues",
    description:
      "List annotation queues, worklists that collect trace or observation items for human review and scoring, with pagination.",
    baseSchema: GetAnnotationQueuesQuery,
    inputSchema: GetAnnotationQueuesQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queues.list",
        context,
        attributes: {
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        },
        fn: async () => {
          const result = await listAnnotationQueuesForApi({
            projectId: context.projectId,
            page: input.page,
            limit: input.limit,
          });

          const parsed = GetAnnotationQueuesResponse.parse(result);

          return {
            ...parsed,
            data: parsed.data.map((queue) => ({
              ...queue,
              url: buildAnnotationQueueUrl({
                projectId: context.projectId,
                queueId: queue.id,
              }),
            })),
          };
        },
      }),
    readOnlyHint: true,
  });
