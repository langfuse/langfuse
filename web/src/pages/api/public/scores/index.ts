import { v4 } from "uuid";

import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresQuery,
  GetScoresResponse,
  legacyFilterAndValidateV1GetScoreList,
  PostScoresBody,
  PostScoresResponse,
} from "@langfuse/shared";
import { prisma, Prisma } from "@langfuse/shared/src/db";
import {
  eventTypes,
  logger,
  processEventBatch,
} from "@langfuse/shared/src/server";
import { tokenCount } from "@/src/features/ingest/usage";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
import {
  generateScoresForPublicApi,
  getScoresCountForPublicApi,
} from "@/src/features/public-api/server/scores";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBody,
    responseSchema: PostScoresResponse,
    fn: async ({ body, auth, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth, tokenCount);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create score", { result });
        throw new Error("Failed to create score");
      }
      return { id: event.body.id };
    },
  }),
  GET: createAuthedAPIRoute({
    name: "/api/public/scores",
    querySchema: GetScoresQuery,
    responseSchema: GetScoresResponse,
    fn: async ({ query, auth }) => {
      const {
        page,
        limit,
        configId,
        queueId,
        traceTags,
        userId,
        name,
        fromTimestamp,
        toTimestamp,
        source,
        operator,
        value,
        scoreIds,
        dataType,
      } = query;

      return await measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "api/public/scores",
        user: null,
        pgExecution: async () => {
          const skipValue = (page - 1) * limit;
          const configCondition = configId
            ? Prisma.sql`AND s."config_id" = ${configId}`
            : Prisma.empty;
          const queueCondition = queueId
            ? Prisma.sql`AND s."queue_id" = ${queueId}`
            : Prisma.empty;
          const traceTagsCondition = traceTags
            ? Prisma.sql`AND ARRAY[${Prisma.join(
                (Array.isArray(traceTags)
                  ? traceTags
                  : traceTags.split(",")
                ).map((v) => Prisma.sql`${v}`),
                ", ",
              )}] <@ t."tags"`
            : Prisma.empty;
          const dataTypeCondition = dataType
            ? Prisma.sql`AND s."data_type" = ${dataType}::"ScoreDataType"`
            : Prisma.empty;
          const userCondition = userId
            ? Prisma.sql`AND t."user_id" = ${userId}`
            : Prisma.empty;
          const nameCondition = name
            ? Prisma.sql`AND s."name" = ${name}`
            : Prisma.empty;
          const fromTimestampCondition = fromTimestamp
            ? Prisma.sql`AND s."timestamp" >= ${fromTimestamp}::timestamp with time zone at time zone 'UTC'`
            : Prisma.empty;
          const toTimestampCondition = toTimestamp
            ? Prisma.sql`AND s."timestamp" < ${toTimestamp}::timestamp with time zone at time zone 'UTC'`
            : Prisma.empty;
          const sourceCondition = source
            ? Prisma.sql`AND s."source" = ${source}::"ScoreSource"`
            : Prisma.empty;
          const valueCondition =
            operator && value !== null && value !== undefined
              ? Prisma.sql`AND s."value" ${Prisma.raw(`${operator}`)} ${value}`
              : Prisma.empty;
          const scoreIdCondition = scoreIds
            ? Prisma.sql`AND s."id" = ANY(${scoreIds})`
            : Prisma.empty;

          const scores = await prisma.$queryRaw<Array<unknown>>(Prisma.sql`
            SELECT
              s.id,
              s.timestamp,
              s.name,
              s.value,
              s.string_value as "stringValue",
              s.author_user_id as "authorUserId",
              s.project_id as "projectId",
              s.created_at as "createdAt",  
              s.updated_at as "updatedAt",  
              s.source,
              s.comment,
              s.data_type as "dataType",
              s.config_id as "configId",
              s.queue_id as "queueId",
              s.trace_id as "traceId",
              s.observation_id as "observationId",
              json_build_object('userId', t.user_id, 'tags', t.tags) as "trace"
            FROM "scores" AS s
            LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${auth.scope.projectId}
            WHERE s.project_id = ${auth.scope.projectId}
            ${configCondition}
            ${queueCondition}
            ${traceTagsCondition}
            ${dataTypeCondition}
            ${userCondition}
            ${nameCondition}
            ${sourceCondition}
            ${fromTimestampCondition}
            ${toTimestampCondition}
            ${valueCondition}
            ${scoreIdCondition}
            ORDER BY s."timestamp" DESC
            LIMIT ${limit} OFFSET ${skipValue}
          `);

          const totalItemsRes = await prisma.$queryRaw<{ count: bigint }[]>(
            Prisma.sql`
              SELECT COUNT(*) as count
              FROM "scores" AS s
              LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${auth.scope.projectId}
              WHERE s.project_id = ${auth.scope.projectId}
              ${configCondition}
              ${queueCondition}
              ${traceTagsCondition}
              ${dataTypeCondition}
              ${userCondition}
              ${nameCondition}
              ${sourceCondition}
              ${fromTimestampCondition}
              ${toTimestampCondition}
              ${valueCondition}
              ${scoreIdCondition}
            `,
          );

          const validatedScores = legacyFilterAndValidateV1GetScoreList(scores);

          const totalItems =
            totalItemsRes[0] !== undefined ? Number(totalItemsRes[0].count) : 0;

          return {
            data: validatedScores,
            meta: {
              page: page,
              limit: limit,
              totalItems,
              totalPages: Math.ceil(totalItems / limit),
            },
          };
        },
        clickhouseExecution: async () => {
          const [items, count] = await Promise.all([
            generateScoresForPublicApi({
              projectId: auth.scope.projectId,
              page: query.page ?? undefined,
              limit: query.limit ?? undefined,
              userId: query.userId ?? undefined,
              name: query.name ?? undefined,
              configId: query.configId ?? undefined,
              queueId: query.queueId ?? undefined,
              traceTags: query.traceTags ?? undefined,
              dataType: query.dataType ?? undefined,
              fromTimestamp: query.fromTimestamp ?? undefined,
              toTimestamp: query.toTimestamp ?? undefined,
              source: query.source ?? undefined,
              value: query.value ?? undefined,
              operator: query.operator ?? undefined,
              scoreIds: query.scoreIds ?? undefined,
            }),
            getScoresCountForPublicApi({
              projectId: auth.scope.projectId,
              page: query.page ?? undefined,
              limit: query.limit ?? undefined,
              userId: query.userId ?? undefined,
              name: query.name ?? undefined,
              configId: query.configId ?? undefined,
              queueId: query.queueId ?? undefined,
              traceTags: query.traceTags ?? undefined,
              dataType: query.dataType ?? undefined,
              fromTimestamp: query.fromTimestamp ?? undefined,
              toTimestamp: query.toTimestamp ?? undefined,
              source: query.source ?? undefined,
              value: query.value ?? undefined,
              operator: query.operator ?? undefined,
              scoreIds: query.scoreIds ?? undefined,
            }),
          ]);

          const finalCount = count ? count : 0;

          return {
            data: legacyFilterAndValidateV1GetScoreList(items),
            meta: {
              page: query.page,
              limit: query.limit,
              totalItems: finalCount,
              totalPages: Math.ceil(finalCount / query.limit),
            },
          };
        },
      });
    },
  }),
});
