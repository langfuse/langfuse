import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueueItemsResponse,
  CreateAnnotationQueueItemBody,
  CreateAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  createAnnotationQueueItemForApi,
  listAnnotationQueueItemsForApi,
} from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue items",
    querySchema: GetAnnotationQueueItemsQuery,
    responseSchema: GetAnnotationQueueItemsResponse,
    fn: async ({ query, auth }) =>
      await listAnnotationQueueItemsForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        page: query.page,
        limit: query.limit,
        status: query.status,
      }),
  }),
  POST: createAuthedProjectAPIRoute({
    name: "Create annotation queue item",
    querySchema: GetAnnotationQueueItemsQuery,
    bodySchema: CreateAnnotationQueueItemBody,
    responseSchema: CreateAnnotationQueueItemResponse,
    fn: async ({ query, body, auth }) =>
      await createAnnotationQueueItemForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
