import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import {
  GetAnnotationQueueByIdQuery,
  GetAnnotationQueueByIdResponse,
} from "@/src/features/public-api/types/annotation-queues";
import { LangfuseNotFoundError } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get annotation queue by ID",
    querySchema: GetAnnotationQueueByIdQuery,
    responseSchema: GetAnnotationQueueByIdResponse,
    fn: async ({ query, auth }) => {
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      return {
        id: queue.id,
        name: queue.name,
        description: queue.description,
        scoreConfigIds: queue.scoreConfigIds,
        createdAt: queue.createdAt,
        updatedAt: queue.updatedAt,
      };
    },
  }),
});
