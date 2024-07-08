import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@langfuse/shared/src/db";
import { eventTypes, ingestionBatchEvent } from "@langfuse/shared";
import * as Sentry from "@sentry/node";
import { v4 } from "uuid";
import {
  handleBatch,
  handleBatchResultLegacy,
} from "@/src/pages/api/public/ingestion";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import {
  GetScoresData,
  GetScoresQuery,
  GetScoresResponse,
  PostScoresBody,
  PostScoresResponse,
  type ValidatedGetScoresData,
} from "@/src/features/public-api/types/scores";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBody,
    responseSchema: PostScoresResponse,
    fn: async ({ body, auth, req, res }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };
      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        {},
        req,
        auth,
      );
      handleBatchResultLegacy(result.errors, result.results, res);
    },
  }),
  GET: createAuthedAPIRoute({
    name: "Get Scores",
    querySchema: GetScoresQuery,
    responseSchema: GetScoresResponse,
    fn: async ({ query, auth }) => {
      const {
        page,
        limit,
        configId,
        userId,
        name,
        fromTimestamp,
        source,
        operator,
        value,
        scoreIds,
        dataType,
      } = query;

      const skipValue = (page - 1) * limit;
      const configCondition = configId
        ? Prisma.sql`AND s."config_id" = ${configId}`
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
      const sourceCondition = source
        ? Prisma.sql`AND s."source" = ${source}`
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
            s.source,
            s.comment,
            s.data_type as "dataType",
            s.config_id as "configId",
            s.trace_id as "traceId",
            s.observation_id as "observationId",
            json_build_object('userId', t.user_id) as "trace"
          FROM "scores" AS s
          LEFT JOIN "traces" AS t ON t.id = s.trace_id AND t.project_id = ${auth.scope.projectId}
          WHERE s.project_id = ${auth.scope.projectId}
          ${configCondition}
          ${dataTypeCondition}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
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
          ${dataTypeCondition}
          ${userCondition}
          ${nameCondition}
          ${sourceCondition}
          ${fromTimestampCondition}
          ${valueCondition}
          ${scoreIdCondition}
        `,
      );

      const validatedScores = scores.reduce(
        (acc: ValidatedGetScoresData[], score) => {
          const result = GetScoresData.safeParse(score);
          if (result.success) {
            acc.push(result.data);
          } else {
            console.error("Score parsing error: ", result.error);
            Sentry.captureException(result.error);
          }
          return acc;
        },
        [] as ValidatedGetScoresData[],
      );

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
  }),
});
