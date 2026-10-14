import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/public-api/types/annotation-queues";
import { getAnnotationQueueForApi } from "@/src/annotation/queues/server";

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
});
