import { prisma } from "@langfuse/shared/src/db";
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
import { LangfuseNotFoundError } from "@langfuse/shared";
import { AnnotationQueueStatus } from "@langfuse/shared";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue item by ID",
    querySchema: GetAnnotationQueueItemByIdQuery,
    responseSchema: GetAnnotationQueueItemByIdResponse,
    fn: async ({ query, auth }) => {
      // Verify the queue exists
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      const item = await prisma.annotationQueueItem.findUnique({
        where: {
          id: query.itemId,
          queueId: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!item) {
        throw new LangfuseNotFoundError("Annotation queue item not found");
      }

      return {
        id: item.id,
        queueId: item.queueId,
        objectId: item.objectId,
        objectType: item.objectType,
        status: item.status,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    },
  }),
  PATCH: createAuthedProjectAPIRoute({
    name: "Update annotation queue item",
    querySchema: GetAnnotationQueueItemByIdQuery,
    bodySchema: UpdateAnnotationQueueItemBody,
    responseSchema: UpdateAnnotationQueueItemResponse,
    fn: async ({ query, body, auth }) => {
      // Verify the queue exists
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Check if the item exists
      const existingItem = await prisma.annotationQueueItem.findUnique({
        where: {
          id: query.itemId,
          queueId: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!existingItem) {
        throw new LangfuseNotFoundError("Annotation queue item not found");
      }

      const updateData = {
        ...body,
        completedAt:
          body.status === AnnotationQueueStatus.COMPLETED
            ? new Date()
            : undefined,
      };

      const item = await prisma.annotationQueueItem.update({
        where: {
          id: query.itemId,
          queueId: query.queueId,
          projectId: auth.scope.projectId,
        },
        data: updateData,
      });

      return {
        id: item.id,
        queueId: item.queueId,
        objectId: item.objectId,
        objectType: item.objectType,
        status: item.status,
        completedAt: item.completedAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    },
  }),
  DELETE: createAuthedProjectAPIRoute({
    name: "Delete annotation queue item",
    querySchema: DeleteAnnotationQueueItemQuery,
    responseSchema: DeleteAnnotationQueueItemResponse,
    fn: async ({ query, auth }) => {
      // Verify the queue exists
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Check if the item exists
      const existingItem = await prisma.annotationQueueItem.findUnique({
        where: {
          id: query.itemId,
          queueId: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!existingItem) {
        throw new LangfuseNotFoundError("Annotation queue item not found");
      }

      // Delete the item
      await prisma.annotationQueueItem.delete({
        where: {
          id: query.itemId,
          queueId: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      return {
        success: true,
        message: "Annotation queue item deleted successfully",
      };
    },
  }),
});
