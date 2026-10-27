import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
  UpdateAnnotationQueueBody,
  UpdateAnnotationQueueResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  getAnnotationQueueForApi,
  updateAnnotationQueueForApi,
} from "@/src/features/annotation-queues/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue by ID",
    action: "annotationQueues:read",
    querySchema: GetAnnotationQueueByIdQuery,
    responseSchema: GetAnnotationQueueByIdResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ query, auth }) =>
      await getAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
      }),
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update annotation queue",
    action: "annotationQueues:CUD",
    querySchema: GetAnnotationQueueByIdQuery,
    bodySchema: UpdateAnnotationQueueBody,
    responseSchema: UpdateAnnotationQueueResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ query, body, auth }) =>
      await updateAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
