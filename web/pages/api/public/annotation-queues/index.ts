import { withMiddlewares } from "@/src/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/public-api/server/createAuthedProjectAPIRoute";
import {
  CreateAnnotationQueueBody,
  CreateAnnotationQueueResponse,
  GetAnnotationQueuesQuery,
  GetAnnotationQueuesResponse,
} from "@/src/public-api/types/annotation-queues";
import {
  createAnnotationQueueForApi,
  listAnnotationQueuesForApi,
} from "@/src/annotation/queues/server";
export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queues",
    action: "annotationQueues:read",
    querySchema: GetAnnotationQueuesQuery,
    responseSchema: GetAnnotationQueuesResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ query, auth }) =>
      await listAnnotationQueuesForApi({
        projectId: auth.scope.projectId,
        page: query.page,
        limit: query.limit,
      }),
  }),

  POST: createAuthedProjectAPIRoute({
    name: "Create annotation queue",
    action: "annotationQueues:CUD",
    bodySchema: CreateAnnotationQueueBody,
    responseSchema: CreateAnnotationQueueResponse,
    rateLimitResource: "annotation-queues",
    fn: async ({ body, auth }) =>
      await createAnnotationQueueForApi({
        projectId: auth.scope.projectId,
        plan: auth.scope.plan,
        input: body,
        auditScope: auth.scope,
      }),
  }),
});
