import { prisma } from "@langfuse/shared/src/db";
import {
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueueItemsResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { defineTool } from "../../../core/define-tool";
import { runMcpTool } from "../../../core/run-mcp-tool";
import { paginationMeta } from "../../publicApi";
import { annotationQueueItemToApi } from "../schema";
import { verifyAnnotationQueue } from "../utils";

export const [listAnnotationQueueItemsTool, handleListAnnotationQueueItems] =
  defineTool({
    name: "listAnnotationQueueItems",
    description:
      "List annotation queue items, each linking one trace or observation to a queue with a review status, with optional status filtering.",
    baseSchema: GetAnnotationQueueItemsQuery,
    inputSchema: GetAnnotationQueueItemsQuery,
    handler: async (input, context) =>
      runMcpTool({
        spanName: "mcp.annotation_queue_items.list",
        context,
        attributes: {
          "mcp.annotation_queue_id": input.queueId,
          "mcp.pagination_page": input.page,
          "mcp.pagination_limit": input.limit,
        },
        fn: async () => {
          await verifyAnnotationQueue({
            projectId: context.projectId,
            queueId: input.queueId,
          });

          const where = {
            projectId: context.projectId,
            queueId: input.queueId,
            ...(input.status ? { status: input.status } : {}),
          };

          const [items, totalItems] = await Promise.all([
            prisma.annotationQueueItem.findMany({
              where,
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: input.limit,
              skip: (input.page - 1) * input.limit,
            }),
            prisma.annotationQueueItem.count({ where }),
          ]);

          return GetAnnotationQueueItemsResponse.parse({
            data: items.map(annotationQueueItemToApi),
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
