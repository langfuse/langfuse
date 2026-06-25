import { z } from "zod/v4";
import { type IntervalUnit } from "@/src/utils/date-range-utils";
import {
  createTRPCRouter,
  protectedProjectProcedure,
} from "@/src/server/api/trpc";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  systemTableRef,
} from "@langfuse/shared/src/server";

const intervalUnitSchema = z.enum([
  "second",
  "minute",
  "hour",
  "day",
  "month",
  "year",
] satisfies [IntervalUnit, ...IntervalUnit[]]);

const intervalUnitSql: Record<IntervalUnit, string> = {
  second: "SECOND",
  minute: "MINUTE",
  hour: "HOUR",
  day: "DAY",
  month: "MONTH",
  year: "YEAR",
};

type LegacyApiUsageRow = {
  time: string;
  entrypoint: string;
  count: string | number;
};

export const v4TransitionRouter = createTRPCRouter({
  timeSeriesByEntrypoint: protectedProjectProcedure
    .input(
      z.object({
        projectId: z.string(),
        fromTimestamp: z.date(),
        toTimestamp: z.date(),
        interval: z.object({
          count: z.number().int().positive().max(10_000),
          unit: intervalUnitSchema,
        }),
      }),
    )
    .query(async ({ input }) => {
      const intervalSql = `${input.interval.count} ${
        intervalUnitSql[input.interval.unit]
      }`;

      const rows = await queryClickhouse<LegacyApiUsageRow>({
        query: `
WITH selected AS (
  SELECT
    toStartOfInterval(event_time_microseconds, INTERVAL ${intervalSql}) AS bucket_time,
    splitByChar('?', simpleJSONExtractString(log_comment, 'route'))[1] AS route_path
  FROM ${systemTableRef("system.query_log")}
  WHERE
    event_time >= {fromTimestamp: DateTime64(3)}
    AND event_time <= {toTimestamp: DateTime64(3)}
    AND event_date >= toDate({fromTimestamp: DateTime64(3)})
    AND event_date <= toDate({toTimestamp: DateTime64(3)})
    AND type = 'QueryFinish'
    AND simpleJSONExtractString(log_comment, 'tag_schema_version') = '1'
    AND simpleJSONExtractString(log_comment, 'surface') = 'publicapi'
    AND simpleJSONExtractString(log_comment, 'projectId') = {projectId: String}
),
classified AS (
  SELECT
    bucket_time,
    multiIf(
      route_path IN (
        'GET /api/public/spans',
        'GET /api/public/generations',
        'GET /api/public/traces',
        'GET /api/public/sessions',
        'GET /api/public/observations',
        'GET /api/public/scores',
        'GET /api/public/v2/scores',
        'GET /api/public/metrics',
        'GET /api/public/metrics/daily'
      ), route_path,
      match(route_path, '^GET /api/public/traces/[^/?#]+$'), 'GET /api/public/traces/:id',
      match(route_path, '^GET /api/public/sessions/[^/?#]+$'), 'GET /api/public/sessions/:id',
      match(route_path, '^GET /api/public/observations/[^/?#]+$'), 'GET /api/public/observations/:id',
      match(route_path, '^GET /api/public/scores/[^/?#]+$'), 'GET /api/public/scores/:id',
      match(route_path, '^GET /api/public/v2/scores/[^/?#]+$'), 'GET /api/public/v2/scores/:id',
      NULL
    ) AS legacy_route
  FROM selected
)

SELECT
  formatDateTime(bucket_time, '%Y-%m-%dT%H:%i:%SZ', 'UTC') AS time,
  concat('publicapi: ', legacy_route) AS entrypoint,
  count() AS count
FROM classified
WHERE legacy_route IS NOT NULL
GROUP BY bucket_time, legacy_route
ORDER BY bucket_time ASC, legacy_route ASC
        `,
        params: {
          projectId: input.projectId,
          fromTimestamp: convertDateToClickhouseDateTime(input.fromTimestamp),
          toTimestamp: convertDateToClickhouseDateTime(input.toTimestamp),
        },
        tags: {
          projectId: input.projectId,
          route: "v4-legacy-api-usage",
        },
        preferredClickhouseService: "ReadOnly",
        clickhouseSettings: {
          skip_unavailable_shards: 1,
        },
      });

      return rows.map((row) => ({
        time: row.time,
        entrypoint: row.entrypoint,
        count: Number(row.count),
      }));
    }),
});
