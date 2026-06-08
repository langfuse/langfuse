import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  AnnotationQueueAssignmentQuery,
  CreateAnnotationQueueAssignmentBody,
  CreateAnnotationQueueAssignmentResponse,
  DeleteAnnotationQueueAssignmentBody,
  DeleteAnnotationQueueAssignmentResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  createAnnotationQueueAssignmentForApi,
  deleteAnnotationQueueAssignmentForApi,
} from "@/src/features/annotation-queues/server/publicAnnotationQueueService";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Annotation Queue Assignment",
    bodySchema: CreateAnnotationQueueAssignmentBody,
    querySchema: AnnotationQueueAssignmentQuery,
    responseSchema: CreateAnnotationQueueAssignmentResponse,
    fn: async ({ query, body, auth }) => {
      const { assignment } = await createAnnotationQueueAssignmentForApi({
        projectId: auth.scope.projectId,
        orgId: auth.scope.orgId,
        queueId: query.queueId,
        input: body,
        auditScope: auth.scope,
      });

      return assignment;
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Annotation Queue Assignment",
    querySchema: AnnotationQueueAssignmentQuery,
    bodySchema: DeleteAnnotationQueueAssignmentBody,
    responseSchema: DeleteAnnotationQueueAssignmentResponse,
    fn: async ({ query, body, auth }) => {
      const result = await deleteAnnotationQueueAssignmentForApi({
        projectId: auth.scope.projectId,
        queueId: query.queueId,
        input: body,
        auditScope: auth.scope,
      });

      return result.response;
    },
  }),
});
