import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { getAnnotationQueueForApi } from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue by ID",
    querySchema: GetAnnotationQueueByIdQuery,
    responseSchema: GetAnnotationQueueByIdResponse,
    fn: async ({ query, auth }) =>
      await getAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
      }),
  }),
});
