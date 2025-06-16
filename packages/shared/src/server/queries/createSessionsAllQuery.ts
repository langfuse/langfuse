import { z } from "zod/v4";

import { Prisma } from "@prisma/client";
import { tableColumnsToSqlFilterAndPrefix } from "../filterToPrisma";
import { singleFilter } from "../../interfaces/filters";
import { orderBy } from "../../interfaces/orderBy";
import { orderByToPrismaSql } from "../orderByToPrisma";
import { sessionsViewCols } from "../../tableDefinitions";

const GetSessionTableSQLParamsSchema = z.object({
  projectId: z.string(),
  filter: z.array(singleFilter).nullable(),
  orderBy: orderBy,
  page: z.number(),
  limit: z.number(),
});
type GetSessionTableSQLParams = z.infer<typeof GetSessionTableSQLParamsSchema>;

export const createSessionsAllQuery = (
  select: Prisma.Sql,
  params: GetSessionTableSQLParams,
  options?: {
    ignoreOrderBy?: boolean; // used by session.metrics and session.all.totalCount
    sessionIdList?: string[]; // used by session.metrics
  },
): Prisma.Sql => {
  const { projectId, filter, orderBy, page, limit } =
    GetSessionTableSQLParamsSchema.parse(params);

  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter ?? [],
    sessionsViewCols,
    "sessions",
  );
  const orderByCondition = orderByToPrismaSql(orderBy, sessionsViewCols);

  const sessionIdFilter = options?.sessionIdList
    ? Prisma.sql`AND s.id IN (${Prisma.join(options?.sessionIdList)})`
    : Prisma.sql``;

  const sql = Prisma.sql`
      SELECT
        ${select}
      FROM
        trace_sessions AS s
        LEFT JOIN LATERAL (
          SELECT
            t.session_id,
            MAX(t. "timestamp") AS "max_timestamp",
            MIN(t. "timestamp") AS "min_timestamp",
            array_agg(t.id) AS "traceIds",
            array_agg(DISTINCT t.user_id) AS "userIds",
            count(t.id)::int AS "countTraces",
            array_agg(DISTINCT u.tag) AS "tags"
          FROM
            traces t
          LEFT JOIN LATERAL (
            SELECT DISTINCT UNNEST(t.tags) AS tag) AS u ON TRUE
          WHERE
            t.project_id = ${projectId}
            AND t.session_id = s.id
          GROUP BY
            t.session_id) AS t ON TRUE
        LEFT JOIN LATERAL (
          SELECT
            EXTRACT(EPOCH FROM COALESCE(MAX(o. "end_time"), MAX(o. "start_time"), t. "max_timestamp")) - EXTRACT(EPOCH FROM COALESCE(MIN(o. "start_time"), t. "min_timestamp"))::double precision AS "sessionDuration",
            SUM(COALESCE(o. "calculated_input_cost", 0)) AS "inputCost",
            SUM(COALESCE(o. "calculated_output_cost", 0)) AS "outputCost",
            SUM(COALESCE(o. "calculated_total_cost", 0)) AS "totalCost",
            SUM(o.prompt_tokens) AS "promptTokens",
            SUM(o.completion_tokens) AS "completionTokens",
            SUM(o.total_tokens) AS "totalTokens"
          FROM
            observations_view o
          WHERE
            o.project_id = ${projectId}
            AND o.trace_id = ANY (t. "traceIds")) AS o ON TRUE
      WHERE
        s. "project_id" = ${projectId}
        ${filterCondition}
        ${sessionIdFilter}
      ${options?.ignoreOrderBy ? Prisma.sql`` : orderByCondition}
      LIMIT ${limit}
      OFFSET ${page * limit}
    `;

  return sql;
};
