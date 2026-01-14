import { prisma } from "@langfuse/shared/src/db";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import {
  GetAnnotationQueueItemsQuery,
  GetAnnotationQueueItemsResponse,
  CreateAnnotationQueueItemBody,
  CreateAnnotationQueueItemResponse,
} from "@/src/features/public-api/types/annotation-queues";
import {
  AnnotationQueueObjectType,
  InvalidRequestError,
  LangfuseNotFoundError,
  AnnotationQueueStatus,
} from "@langfuse/shared";
import { z } from "zod/v4";

const isArrayNotNull = <T>(array: T[] | null | undefined): array is T[] => {
  return array !== null && array !== undefined && array.length > 0;
};

const buildWhereClause = (
  query: z.infer<typeof GetAnnotationQueueItemsQuery>,
  projectId: string,
) => {
  const where: {
    projectId: string;
    queueId: string;
    status?: AnnotationQueueStatus;
    objectType?: AnnotationQueueObjectType;
    objectId?: { in: string[] };
  } = {
    projectId: projectId,
    queueId: query.queueId,
  };
  if (query.status) {
    where.status = query.status;
  }
  if (isArrayNotNull(query.traceIds)) {
    where.objectType = AnnotationQueueObjectType.TRACE;
    where.objectId = { in: query.traceIds };
  }
  if (isArrayNotNull(query.observationIds)) {
    where.objectType = AnnotationQueueObjectType.OBSERVATION;
    where.objectId = { in: query.observationIds };
  }
  if (isArrayNotNull(query.sessionIds)) {
    where.objectType = AnnotationQueueObjectType.SESSION;
    where.objectId = { in: query.sessionIds };
  }
  return where;
};

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get annotation queue items",
    querySchema: GetAnnotationQueueItemsQuery,
    responseSchema: GetAnnotationQueueItemsResponse,
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

      // Verify that the user did not specify more than one of the object type filters
      const objectTypeFilters = [
        query.traceIds,
        query.observationIds,
        query.sessionIds,
      ];
      if (objectTypeFilters.filter(isArrayNotNull).length > 1) {
        throw new InvalidRequestError(
          "Only one of traceIds, observationIds, or sessionIds can be specified",
        );
      }

      // Build the where clause based on the query parameters
      const where = buildWhereClause(query, auth.scope.projectId);

      const [items, totalItems] = await Promise.all([
        prisma.annotationQueueItem.findMany({
          where,
          orderBy: [
            {
              createdAt: "desc",
            },
            {
              id: "desc",
            },
          ],
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        }),
        prisma.annotationQueueItem.count({
          where,
        }),
      ]);

      return {
        data: items.map((item) => ({
          id: item.id,
          queueId: item.queueId,
          objectId: item.objectId,
          objectType: item.objectType,
          status: item.status,
          completedAt: item.completedAt,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
  POST: createAuthedProjectAPIRoute({
    name: "Create annotation queue item",
    querySchema: GetAnnotationQueueItemsQuery,
    bodySchema: CreateAnnotationQueueItemBody,
    responseSchema: CreateAnnotationQueueItemResponse,
    fn: async ({ query, body, auth }) => {
      // Check if the queue exists
      const queue = await prisma.annotationQueue.findUnique({
        where: {
          id: query.queueId,
          projectId: auth.scope.projectId,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Annotation queue not found");
      }

      // Create the queue item with status defaulting to PENDING if not provided
      const status = body.status || AnnotationQueueStatus.PENDING;

      // Set completedAt if status is COMPLETED
      const completedAt =
        status === AnnotationQueueStatus.COMPLETED ? new Date() : null;

      const item = await prisma.annotationQueueItem.create({
        data: {
          queueId: query.queueId,
          objectId: body.objectId,
          objectType: body.objectType,
          status,
          completedAt,
          projectId: auth.scope.projectId,
        },
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
});
