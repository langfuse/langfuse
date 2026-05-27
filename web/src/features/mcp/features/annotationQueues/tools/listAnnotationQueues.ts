import { prisma } from "@langfuse/shared/src/db";
import {
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { annotationQueueToApi } from "../schema";

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
          const [queues, totalItems] = await Promise.all([
            prisma.annotationQueue.findMany({
              where: { projectId: context.projectId },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: input.limit,
              skip: (input.page - 1) * input.limit,
            }),
            prisma.annotationQueue.count({
              where: { projectId: context.projectId },
            }),
          ]);

          return GetAnnotationQueuesResponse.parse({
            data: queues.map(annotationQueueToApi),
            meta: paginationMeta({
              page: input.page,
              limit: input.limit,
              totalItems,
            }),
          });
        },
      }),
    readOnlyHint: true,
  });
