import { prisma } from "@langfuse/shared/src/db";
import {
  PostTracesV1Body,
  GetTracesV1Query,
  GetTracesV1Response,
  PostTracesV1Response,
} from "@/src/features/public-api/types/traces";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { Prisma } from "@langfuse/shared/src/db";
import { parseSingleTypedIngestionApiResponse } from "@/src/pages/api/public/ingestion";
import { type Trace } from "@langfuse/shared";
import { eventTypes, handleBatch } from "@langfuse/shared/src/server";

import { v4 } from "uuid";
import { telemetry } from "@/src/features/telemetry";
import { tracesTableCols, orderByToPrismaSql } from "@langfuse/shared";
import { tokenCount } from "@/src/features/ingest/usage";

export default withMiddlewares({
  POST: createAuthedAPIRoute({
    name: "Create Trace",
    bodySchema: PostTracesV1Body,
    responseSchema: PostTracesV1Response, // Adjust this if you have a specific response schema
    fn: async ({ body, auth }) => {
      await telemetry();

      const event = {
        id: v4(),
        type: eventTypes.TRACE_CREATE,
        timestamp: new Date().toISOString(),
        body: body,
      };

      const result = await handleBatch([event], auth, tokenCount);
      const response = parseSingleTypedIngestionApiResponse(
        result.errors,
        result.results,
        PostTracesV1Response,
      );
      return response;
    },
  }),

  GET: createAuthedAPIRoute({
    name: "Get Traces",
    querySchema: GetTracesV1Query,
    responseSchema: GetTracesV1Response,
    fn: async ({ query, auth }) => {
      const skipValue = (query.page - 1) * query.limit;
      const userCondition = query.userId
        ? Prisma.sql`AND t."user_id" = ${query.userId}`
        : Prisma.empty;
      const nameCondition = query.name
        ? Prisma.sql`AND t."name" = ${query.name}`
        : Prisma.empty;
      const tagsCondition = query.tags
        ? Prisma.sql`AND ARRAY[${Prisma.join(
            (Array.isArray(query.tags) ? query.tags : [query.tags]).map(
              (v) => Prisma.sql`${v}`,
            ),
            ", ",
          )}] <@ t."tags"`
        : Prisma.empty;
      const sessionCondition = query.sessionId
        ? Prisma.sql`AND t."session_id" = ${query.sessionId}`
        : Prisma.empty;
      const fromTimestampCondition = query.fromTimestamp
        ? Prisma.sql`AND t."timestamp" >= ${query.fromTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const toTimestampCondition = query.toTimestamp
        ? Prisma.sql`AND t."timestamp" < ${query.toTimestamp}::timestamp with time zone at time zone 'UTC'`
        : Prisma.empty;
      const versionCondition = query.version
        ? Prisma.sql`AND t."version" = ${query.version}`
        : Prisma.empty;
      const releaseCondition = query.release
        ? Prisma.sql`AND t."release" = ${query.release}`
        : Prisma.empty;

      const orderByCondition = orderByToPrismaSql(
        query.orderBy ?? null,
        tracesTableCols,
      );

      const traces = await prisma.$queryRaw<
        Array<
          Trace & {
            observations: string[];
            scores: string[];
            totalCost: number;
            latency: number;
            htmlPath: string;
          }
        >
      >(Prisma.sql`
        SELECT
          t.id,
          CONCAT('/project/', t.project_id,'/traces/',t.id) as "htmlPath",
          t.timestamp,
          t.name,
          t.input,
          t.output,
          t.project_id as "projectId",
          t.session_id as "sessionId",
          t.metadata,
          t.external_id as "externalId",
          t.user_id as "userId",
          t.release,
          t.version,
          t.bookmarked,
          t.created_at as "createdAt",
          t.updated_at as "updatedAt",
          t.public,
          t.tags,
          COALESCE(o."totalCost", 0)::DOUBLE PRECISION AS "totalCost",
          COALESCE(o."latency", 0)::double precision AS "latency",
          COALESCE(o."observations", ARRAY[]::text[]) AS "observations",
          COALESCE(s."scores", ARRAY[]::text[]) AS "scores"
        FROM (
          SELECT *
          FROM "traces" t
          WHERE project_id = ${auth.scope.projectId}
          ${fromTimestampCondition}
          ${toTimestampCondition}
          ${userCondition}
          ${nameCondition}
          ${tagsCondition}
          ${versionCondition}
          ${releaseCondition}
          ${sessionCondition}
          ${orderByCondition}
          LIMIT ${query.limit} OFFSET ${skipValue}
        ) AS t
        LEFT JOIN LATERAL (
          SELECT
            SUM(o.calculated_total_cost)::DOUBLE PRECISION AS "totalCost",
            EXTRACT(EPOCH FROM COALESCE(MAX(o."end_time"), MAX(o."start_time"))) - EXTRACT(EPOCH FROM MIN(o."start_time"))::DOUBLE PRECISION AS "latency",
            ARRAY_AGG(DISTINCT o.id) FILTER (WHERE o.id IS NOT NULL) AS "observations"
          FROM "observations_view" AS o
          WHERE o.trace_id = t.id AND o.project_id = ${auth.scope.projectId}
        ) AS o ON true
        LEFT JOIN LATERAL (
          SELECT
            ARRAY_AGG(DISTINCT s.id) FILTER (WHERE s.id IS NOT NULL) AS "scores"
          FROM "scores" AS s
          WHERE s.trace_id = t.id AND s.project_id = ${auth.scope.projectId}
        ) AS s ON true
      `);

      const totalItems = await prisma.trace.count({
        where: {
          projectId: auth.scope.projectId,
          name: query.name ? query.name : undefined,
          userId: query.userId ? query.userId : undefined,
          sessionId: query.sessionId ? query.sessionId : undefined,
          version: query.version ? query.version : undefined,
          release: query.release ? query.release : undefined,
          timestamp: {
            gte: query.fromTimestamp
              ? new Date(query.fromTimestamp)
              : undefined,
            lt: query.toTimestamp ? new Date(query.toTimestamp) : undefined,
          },
          tags: query.tags
            ? {
                hasEvery: Array.isArray(query.tags) ? query.tags : [query.tags],
              }
            : undefined,
        },
      });

      return {
        data: traces,
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems,
          totalPages: Math.ceil(totalItems / query.limit),
        },
      };
    },
  }),
});
