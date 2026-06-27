import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueItemByIdQuery,
  GetAnnotationQueueItemByIdResponse,
  UpdateAnnotationQueueItemBody,
  UpdateAnnotationQueueItemResponse,
  DeleteAnnotationQueueItemQuery,
  DeleteAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  deleteAnnotationQueueItemForApi,
  getAnnotationQueueItemForApi,
  updateAnnotationQueueItemForApi,
} from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue item by ID",
    querySchema: GetAnnotationQueueItemByIdQuery,
    responseSchema: GetAnnotationQueueItemByIdResponse,
    fn: async ({ query, auth }) =>
      await getAnnotationQueueItemForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        itemId: query.itemId,
      }),
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update annotation queue item",
    querySchema: GetAnnotationQueueItemByIdQuery,
    bodySchema: UpdateAnnotationQueueItemBody,
    responseSchema: UpdateAnnotationQueueItemResponse,
    fn: async ({ query, body, auth }) =>
      await updateAnnotationQueueItemForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        itemId: query.itemId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete annotation queue item",
    querySchema: DeleteAnnotationQueueItemQuery,
    responseSchema: DeleteAnnotationQueueItemResponse,
    fn: async ({ query, auth }) =>
      await deleteAnnotationQueueItemForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        itemId: query.itemId,
        auditScope: auth.scope,
      }),
  }),
});
