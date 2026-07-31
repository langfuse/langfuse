import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  DeleteAnnotationQueueQuery,
  DeleteAnnotationQueueResponse,
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  deleteAnnotationQueueForApi,
  getAnnotationQueueForApi,
} from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue by ID",
    querySchema: GetAnnotationQueueByIdQuery,
    responseSchema: GetAnnotationQueueByIdResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ query, auth }) =>
      await getAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
      }),
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete annotation queue",
    querySchema: DeleteAnnotationQueueQuery,
    responseSchema: DeleteAnnotationQueueResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ query, auth }) =>
      await deleteAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        auditScope: auth.scope,
      }),
  }),
});
