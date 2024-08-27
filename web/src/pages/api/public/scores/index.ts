import { v4 } from "uuid";

import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { parseSingleTypedIngestionApiResponse } from "@/src/pages/api/public/ingestion";
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
  handleBatch,
  ingestionBatchEvent,
} from "@langfuse/shared/src/server";
import { tokenCount } from "@/src/features/ingest/usage";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Score",
    bodySchema: PostScoresBody,
    responseSchema: PostScoresResponse,
    fn: async ({ body, auth }) => {
      const event = {
        id: v4(),
        type: eventTypes.SCORE_CREATE,
        timestamp: new Date().toISOString(),
        body,
      };
      const result = await handleBatch(
        ingestionBatchEvent.parse([event]),
        auth,
        tokenCount,
      );
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PostScoresResponse,
      );
      return response;
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
        toTimestamp,
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
      const toTimestampCondition = toTimestamp
        ? Prisma.sql`AND s."timestamp" < ${toTimestamp}::timestamp with time zone at time zone 'UTC'`
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
            s.author_user_id as "authorUserId",
            s.project_id as "projectId",
            s.created_at as "createdAt",  
            s.updated_at as "updatedAt",  
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
  }),
});
