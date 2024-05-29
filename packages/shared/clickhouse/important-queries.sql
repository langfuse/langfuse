SELECT t.*,
  t."user_id" AS "userId",
  t."metadata" AS "metadata",
  t.session_id AS "sessionId",
  t."bookmarked" AS "bookmarked",
  COALESCE(tm."promptTokens", 0)::int AS "promptTokens",
  COALESCE(tm."completionTokens", 0)::int AS "completionTokens",
  COALESCE(tm."totalTokens", 0)::int AS "totalTokens",
  tl.latency AS "latency",
  tl."observationCount" AS "observationCount",
  COALESCE(tm."calculatedTotalCost", 0)::numeric AS "calculatedTotalCost",
  COALESCE(tm."calculatedInputCost", 0)::numeric AS "calculatedInputCost",
  COALESCE(tm."calculatedOutputCost", 0)::numeric AS "calculatedOutputCost",
  tm."level" AS "level"
FROM "traces" AS t
  LEFT JOIN LATERAL (
    SELECT SUM(prompt_tokens) AS "promptTokens",
      SUM(completion_tokens) AS "completionTokens",
      SUM(total_tokens) AS "totalTokens",
      SUM(calculated_total_cost) AS "calculatedTotalCost",
      SUM(calculated_input_cost) AS "calculatedInputCost",
      SUM(calculated_output_cost) AS "calculatedOutputCost",
      COALESCE(
        MAX(
          CASE
            WHEN level = 'ERROR' THEN 'ERROR'
          END
        ),
        MAX(
          CASE
            WHEN level = 'WARNING' THEN 'WARNING'
          END
        ),
        MAX(
          CASE
            WHEN level = 'DEFAULT' THEN 'DEFAULT'
          END
        ),
        'DEBUG'
      ) AS "level"
    FROM "observations_view"
    WHERE trace_id = t.id
      AND "type" = 'GENERATION'
      AND "project_id" = $1
  ) AS tm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS "observationCount",
      EXTRACT(
        EPOCH
        FROM COALESCE(MAX("end_time"), MAX("start_time"))
      ) - EXTRACT(
        EPOCH
        FROM MIN("start_time")
      )::double precision AS "latency"
    FROM "observations"
    WHERE trace_id = t.id
      AND "project_id" = $2
  ) AS tl ON true
  LEFT JOIN LATERAL (
    SELECT jsonb_object_agg(name::text, avg_value::double precision) AS "scores_avg"
    FROM (
        SELECT name,
          AVG(value) avg_value
        FROM scores
        WHERE trace_id = t.id
        GROUP BY name
      ) tmp
  ) AS s_avg ON true
WHERE t."project_id" = $3
  AND t."timestamp" > $4::timestamp with time zone at time zone 'UTC'
  AND t."name" IN ($5)
  AND tm."promptTokens" > $6::DOUBLE PRECISION
  AND cast(scores_avg->>$7 as double precision) > $8::DOUBLE PRECISION
ORDER BY t."timestamp" DESC NULLS LAST
LIMIT $9 OFFSET $10