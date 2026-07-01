import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  createAnnotationQueueForApi,
  listAnnotationQueuesForApi,
} from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queues",
    querySchema: GetAnnotationQueuesQuery,
    responseSchema: GetAnnotationQueuesResponse,
    fn: async ({ query, auth }) =>
      await listAnnotationQueuesForApi({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),

  POST: createAuthedProjectAPIRoute({
    name: "Create annotation queue",
    bodySchema: CreateAnnotationQueueBody,
    responseSchema: CreateAnnotationQueueResponse,
    fn: async ({ body, auth }) =>
      await createAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        plan: auth.scope.plan,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
