import { auditLog } from "@/src/features/audit-logs/server";
import { throwIfNoProjectAccess } from "@/src/features/rbac";
import { createBatchActionJob } from "@/src/features/table/server";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  ActionId,
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  BatchActionQuerySchema,
  BatchActionType,
  BatchExportTableName,
  type BatchTableNames,
  LangfuseNotFoundError,
  paginationZod,
  Prisma,
  type ScoreConfigCategoryDomain,
  singleFilter,
} from "@langfuse/shared";
import {
  getObservationById,
  getObservationByIdFromEventsTable,
  getObservationsTraceIdsFromEventsTable,
  getScoresForObservations,
  getScoresForSessions,
  getScoresForTraces,
  getTraceIdsForObservations,
  getTraceSummariesByIds,
  logger,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { env } from "@/src/env.mjs";
import { type QueueItemScore } from "@/src/features/annotation-queues/lib/queueItemScores";
import { queueItemMatchesFilters } from "@/src/features/annotation-queues/lib/queueItemFilters";
import {
  getQueueTraceColumnMetadataKeys,
  parseQueueTraceColumns,
  type QueueTraceColumn,
  readQueueTraceField,
} from "@/src/features/annotation-queues/lib/queueTraceColumns";

const isItemLocked = (item: AnnotationQueueItem) => {
  return (
    item.lockedByUserId &&
    item.lockedAt &&
    new Date(item.lockedAt) > new Date(Date.now() - 5 * 60 * 1000)
  );
};

type QueueItemListRow = {
  id: string;
  status: AnnotationQueueStatus;
  objectId: string;
  objectType: AnnotationQueueObjectType;
  completedAt: string | null;
  annotatorUserId: string | null;
  annotatorUserImage: string | null;
  annotatorUserName: string | null;
};

/** Largest queue that `itemsByQueueId` filters in memory. */
const MAX_FILTERABLE_QUEUE_ITEMS = 20_000;
/** Ids per ClickHouse read, so query parameters stay small on large queues. */
const CLICKHOUSE_ID_CHUNK_SIZE = 1_000;

const readInChunks = async <T>(
  ids: string[],
  read: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> => {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CLICKHOUSE_ID_CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CLICKHOUSE_ID_CHUNK_SIZE));
  }
  return (await Promise.all(chunks.map(read))).flat();
};

/**
 * Loads what the queue items table shows next to each item: its scores from
 * every source, the parent trace of observations, and a summary of the item's
 * trace (an observation's parent trace) with the values of the queue's trace
 * columns. Each object type costs one batched
 * read per chunk of ids, so a page that only holds traces issues a single
 * scores query.
 */
const loadQueueItemDetails = async (
  projectId: string,
  queueItems: QueueItemListRow[],
  traceColumns: QueueTraceColumn[],
) => {
  const objectIdsOfType = (objectType: AnnotationQueueObjectType) =>
    queueItems
      .filter((item) => item.objectType === objectType)
      .map((item) => item.objectId);
  const observationIds = objectIdsOfType(AnnotationQueueObjectType.OBSERVATION);
  const itemTraceIds = objectIdsOfType(AnnotationQueueObjectType.TRACE);
  const sessionIds = objectIdsOfType(AnnotationQueueObjectType.SESSION);

  const traceIdsPromise = readInChunks(observationIds, (chunk) =>
    env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
      ? getObservationsTraceIdsFromEventsTable({
          projectId,
          observationIds: chunk,
        })
      : getTraceIdsForObservations(projectId, chunk),
  );
  // Observation items show their parent trace, so its summary is read too.
  const traceSummariesPromise = traceIdsPromise.then((traceIds) =>
    readInChunks(
      [
        ...new Set([
          ...itemTraceIds,
          ...traceIds.flatMap((t) => (t.traceId ? [t.traceId] : [])),
        ]),
      ],
      (chunk) =>
        getTraceSummariesByIds({
          projectId,
          traceIds: chunk,
          metadataKeys: getQueueTraceColumnMetadataKeys(traceColumns),
        }),
    ),
  );

  const [traceIds, scores, traceSummaries] = await Promise.all([
    traceIdsPromise,
    Promise.all([
      readInChunks(itemTraceIds, (chunk) =>
        getScoresForTraces({
          projectId,
          traceIds: chunk,
          level: "trace",
          excludeMetadata: true,
        }),
      ),
      readInChunks(observationIds, (chunk) =>
        getScoresForObservations({
          projectId,
          observationIds: chunk,
          excludeMetadata: true,
        }),
      ),
      readInChunks(sessionIds, (chunk) =>
        getScoresForSessions({
          projectId,
          sessionIds: chunk,
          excludeMetadata: true,
        }),
      ),
    ]).then((results) => results.flat()),
    traceSummariesPromise,
  ]);

  const scoresByObjectId = new Map<string, QueueItemScore[]>();
  for (const score of scores) {
    const objectId = score.observationId ?? score.sessionId ?? score.traceId;
    if (!objectId) continue;
    const list = scoresByObjectId.get(objectId) ?? [];
    list.push({
      id: score.id,
      name: score.name,
      source: score.source,
      configId: score.configId,
      dataType: score.dataType,
      value: score.value,
      stringValue: score.stringValue,
      timestamp: score.timestamp,
    });
    scoresByObjectId.set(objectId, list);
  }
  const parentTraceIdById = new Map(traceIds.map((t) => [t.id, t.traceId]));
  const traceSummaryById = new Map(
    traceSummaries.map((trace) => [trace.id, trace]),
  );

  return {
    inflate: (item: QueueItemListRow) => {
      const parentTraceId = parentTraceIdById.get(item.objectId) || null;
      // Only observations have a parent trace; sessions have neither.
      const traceId =
        item.objectType === AnnotationQueueObjectType.TRACE
          ? item.objectId
          : parentTraceId;
      const trace = traceId ? (traceSummaryById.get(traceId) ?? null) : null;
      return {
        ...item,
        parentTraceId,
        scores: scoresByObjectId.get(item.objectId) ?? [],
        trace,
        traceFields: Object.fromEntries(
          traceColumns.map((column) => [
            column.id,
            trace ? readQueueTraceField(trace, column) : null,
          ]),
        ),
      };
    },
  };
};

const MAP_OBJECT_TYPE_TO_ACTION_PROPS: Record<
  AnnotationQueueObjectType,
  {
    actionId: Exclude<
      ActionId,
      | ActionId.ObservationAddToDataset
      | ActionId.ObservationBatchEvaluation
      | ActionId.ExperimentCompare
    >;
    tableName: BatchTableNames;
  }
> = {
  [AnnotationQueueObjectType.TRACE]: {
    actionId: ActionId.TraceAddToAnnotationQueue,
    tableName: BatchExportTableName.Traces,
  },
  [AnnotationQueueObjectType.SESSION]: {
    actionId: ActionId.SessionAddToAnnotationQueue,
    tableName: BatchExportTableName.Sessions,
  },
  [AnnotationQueueObjectType.OBSERVATION]: {
    actionId: ActionId.ObservationAddToAnnotationQueue,
    tableName:
      env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
        ? BatchExportTableName.Events
        : BatchExportTableName.Observations,
  },
};

export const queueItemRouter = createTRPCRouter({
  typeById: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
        queueId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      const item = await ctx.prisma.annotationQueueItem.findUnique({
        where: {
          id: input.itemId,
          projectId: input.projectId,
          queueId: input.queueId,
        },
        select: {
          objectType: true,
        },
      });
      return item?.objectType;
    }),
  byId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
        isBetaEnabled: z.boolean().optional().default(false),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      const item = await ctx.prisma.annotationQueueItem.findUnique({
        where: {
          id: input.itemId,
          projectId: input.projectId,
        },
      });

      // Expected behavior, non-error case: if user has seen item in given session, prior to it being deleted, we return null
      if (!item) return null;
      let lockedByUser: { name: string | null } | null = null;

      if (isItemLocked(item)) {
        lockedByUser = await ctx.prisma.user.findUnique({
          where: {
            id: item.lockedByUserId as string,
          },
          select: {
            name: true,
          },
        });
      }

      const inflatedItem = {
        ...item,
        lockedByUser,
      };

      if (item.objectType === AnnotationQueueObjectType.OBSERVATION) {
        const clickhouseObservation =
          env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true"
            ? await getObservationByIdFromEventsTable({
                id: item.objectId,
                projectId: input.projectId,
              })
            : // eslint-disable-next-line @typescript-eslint/no-deprecated
              await getObservationById({
                id: item.objectId,
                projectId: input.projectId,
              });

        if (!clickhouseObservation) {
          throw new LangfuseNotFoundError("Observation not found");
        }

        return {
          ...inflatedItem,
          parentTraceId: clickhouseObservation?.traceId,
        };
      }

      return inflatedItem;
    }),
  /**
   * The queue's trace column values for one trace, read the same way as the
   * items table, so the item page's summary strip shows the same values in
   * both read paths (the v4 trace view loads metadata lazily).
   */
  traceFieldsByTraceId: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        traceId: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });
      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: { id: input.queueId, projectId: input.projectId },
        select: { displayColumns: true },
      });
      const traceColumns = parseQueueTraceColumns(queue?.displayColumns);
      if (traceColumns.length === 0) return {};
      const [trace] = await getTraceSummariesByIds({
        projectId: input.projectId,
        traceIds: [input.traceId],
        metadataKeys: getQueueTraceColumnMetadataKeys(traceColumns),
      });
      return Object.fromEntries(
        traceColumns.map((column) => [
          column.id,
          trace ? readQueueTraceField(trace, column) : null,
        ]),
      );
    }),
  itemsByQueueId: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
        filter: z.array(singleFilter).optional(),
        ...paginationZod,
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      const filters = input.filter ?? [];
      const selectItems = (paginate: boolean) =>
        ctx.prisma.$queryRaw<QueueItemListRow[]>(Prisma.sql`
            SELECT
              aqi.id,
              aqi.status,
              aqi.object_id AS "objectId",
              aqi.object_type AS "objectType",
              aqi.completed_at AS "completedAt",
              aqi.annotator_user_id AS "annotatorUserId",
              u.image AS "annotatorUserImage",
              u.name AS "annotatorUserName"
            FROM
              annotation_queue_items aqi
            LEFT JOIN
              users u ON u.id = aqi.annotator_user_id AND u.id in (SELECT user_id FROM organization_memberships WHERE org_id = ${ctx.session.orgId})
            WHERE
              aqi.project_id = ${input.projectId} AND aqi.queue_id = ${input.queueId}
            ORDER BY
              aqi.created_at ASC,
              aqi.object_id ASC,
              aqi.object_type ASC
            ${paginate && input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty}
            ${paginate && input.page && input.limit ? Prisma.sql`OFFSET ${input.page * input.limit}` : Prisma.empty}
          `);
      const countItems = () =>
        ctx.prisma.annotationQueueItem.count({
          where: {
            queueId: input.queueId,
            projectId: input.projectId,
          },
        });

      const getQueue = () =>
        ctx.prisma.annotationQueue.findUnique({
          where: { id: input.queueId, projectId: input.projectId },
          select: { scoreConfigIds: true, displayColumns: true },
        });

      if (filters.length === 0) {
        const [queueItems, totalItems, queue] = await Promise.all([
          selectItems(true),
          countItems(),
          getQueue(),
        ]);
        const details = await loadQueueItemDetails(
          input.projectId,
          queueItems,
          parseQueueTraceColumns(queue?.displayColumns),
        );
        return {
          queueItems: queueItems.map(details.inflate),
          totalItems,
        };
      }

      // Score values live in ClickHouse and queue items in Postgres, so a
      // filtered request loads the whole queue, filters it on the values the
      // table shows and paginates in memory. The queue size cap keeps it bounded.
      const queueSize = await countItems();
      if (queueSize > MAX_FILTERABLE_QUEUE_ITEMS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Filtering is available for queues with up to ${MAX_FILTERABLE_QUEUE_ITEMS} items; this queue has ${queueSize}.`,
        });
      }
      const [allItems, queue] = await Promise.all([
        selectItems(false),
        getQueue(),
      ]);
      const traceColumns = parseQueueTraceColumns(queue?.displayColumns);
      const configs = queue
        ? await ctx.prisma.scoreConfig.findMany({
            where: {
              projectId: input.projectId,
              id: { in: queue.scoreConfigIds },
            },
            select: { id: true, name: true, dataType: true, categories: true },
          })
        : [];
      const filterConfigs = configs.map((config) => ({
        ...config,
        categories: config.categories as ScoreConfigCategoryDomain[] | null,
      }));
      const details = await loadQueueItemDetails(
        input.projectId,
        allItems,
        traceColumns,
      );
      const matchingItems = allItems.map(details.inflate).filter((item) =>
        queueItemMatchesFilters(
          {
            status: item.status,
            traceUserId: item.trace?.userId,
            traceFields: item.traceFields,
            scores: item.scores,
          },
          filters,
          filterConfigs,
          traceColumns,
        ),
      );
      const offset = (input.page ?? 0) * (input.limit ?? 0);

      return {
        queueItems: input.limit
          ? matchingItems.slice(offset, offset + input.limit)
          : matchingItems,
        totalItems: matchingItems.length,
      };
    }),
  unseenPendingItemCountByQueueId: protectedProjectProcedure
    .input(
      z.object({
        queueId: z.string(),
        projectId: z.string(),
        seenItemIds: z.array(z.string()),
      }),
    )
    .query(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:read",
      });

      const count = await ctx.prisma.annotationQueueItem.count({
        where: {
          queueId: input.queueId,
          projectId: input.projectId,
          status: AnnotationQueueStatus.PENDING,
          id: {
            notIn: input.seenItemIds,
          },
        },
      });
      return count;
    }),
  createMany: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        queueId: z.string(),
        objectIds: z
          .array(z.string())
          .min(1, "Minimum 1 object_id is required."),
        objectType: z.enum(AnnotationQueueObjectType),
        query: BatchActionQuerySchema.optional(),
        isBatchAction: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const queue = await ctx.prisma.annotationQueue.findUnique({
        where: {
          id: input.queueId,
          projectId: input.projectId,
        },
        select: {
          name: true,
          id: true,
        },
      });

      if (!queue) {
        throw new LangfuseNotFoundError("Queue not found in project");
      }

      let createdCount = 0;

      if (input.isBatchAction && input.query) {
        const actionProps = MAP_OBJECT_TYPE_TO_ACTION_PROPS[input.objectType];
        if (!actionProps) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Batch action not supported for object type: ${input.objectType}`,
          });
        }
        const { actionId, tableName } = actionProps;
        await createBatchActionJob({
          projectId: input.projectId,
          actionId,
          actionType: BatchActionType.Create,
          tableName,
          session: ctx.session,
          query: input.query,
          targetId: input.queueId,
        });
      } else {
        const { count } = await ctx.prisma.annotationQueueItem.createMany({
          data: input.objectIds.map((objectId) => ({
            projectId: input.projectId,
            queueId: input.queueId,
            objectId,
            objectType: input.objectType,
          })),
          skipDuplicates: true,
        });
        createdCount = count;

        const createdItems = await ctx.prisma.annotationQueueItem.findMany({
          where: {
            projectId: input.projectId,
            queueId: input.queueId,
            objectId: { in: input.objectIds },
            objectType: input.objectType,
          },
          orderBy: { createdAt: "desc" },
        });

        for (const item of createdItems) {
          await auditLog(
            {
              session: ctx.session,
              resourceType: "annotationQueueItem",
              resourceId: item.id,
              action: "create",
              after: item,
            },
            ctx.prisma,
          );
        }
      }

      return {
        createdCount,
        queueName: queue.name,
        queueId: queue.id,
      };
    }),
  deleteMany: protectedProjectProcedure
    .input(
      z.object({
        itemIds: z.array(z.string()).min(1, "Minimum 1 item_id is required."),
        projectId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      throwIfNoProjectAccess({
        session: ctx.session,
        projectId: input.projectId,
        scope: "annotationQueues:CUD",
      });

      const items = await ctx.prisma.annotationQueueItem.findMany({
        where: {
          id: {
            in: input.itemIds,
          },
          projectId: input.projectId,
        },
      });

      for (const item of items) {
        await auditLog({
          resourceType: "annotationQueueItem",
          resourceId: item.id,
          before: item,
          action: "delete",
          session: ctx.session,
        });
      }

      const { count } = await ctx.prisma.annotationQueueItem.deleteMany({
        where: {
          id: {
            in: input.itemIds,
          },
          projectId: input.projectId,
        },
      });

      return {
        deletedCount: count,
      };
    }),
  complete: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        itemId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        throwIfNoProjectAccess({
          session: ctx.session,
          projectId: input.projectId,
          scope: "annotationQueues:CUD",
        });

        const item = await ctx.prisma.annotationQueueItem.update({
          where: {
            id: input.itemId,
            projectId: input.projectId,
            status: AnnotationQueueStatus.PENDING,
          },
          data: {
            status: AnnotationQueueStatus.COMPLETED,
            completedAt: new Date(),
            annotatorUserId: ctx.session.user.id,
          },
        });

        await auditLog({
          resourceType: "annotationQueueItem",
          resourceId: item.id,
          action: "complete",
          after: item,
          session: ctx.session,
        });

        return item;
      } catch (error) {
        logger.error(error);
        if (error instanceof TRPCError) {
          throw error;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "The item to complete was not found, it was likely deleted.",
          });
        }
        throw error;
      }
    }),
});
