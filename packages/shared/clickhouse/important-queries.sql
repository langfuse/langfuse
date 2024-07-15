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
LIMIT $9 OFFSET $10;
-- generations 
table WITH scores_avg AS (
  SELECT trace_id,
    observation_id,
    jsonb_object_agg(name::text, avg_value::double precision) AS scores_avg
  FROM (
      SELECT trace_id,
        observation_id,
        name,
        avg(value) avg_value,
        comment
      FROM scores
      WHERE project_id = $1
      GROUP BY 1,
        2,
        3,
        5
      ORDER BY 1
    ) tmp
  GROUP BY 1,
    2
)
SELECT o.id,
  o.name,
  o.model,
  o."modelParameters",
  o.start_time as "startTime",
  o.end_time as "endTime",
  o.metadata,
  o.trace_id as "traceId",
  t.name as "traceName",
  o.completion_start_time as "completionStartTime",
  o.time_to_first_token as "timeToFirstToken",
  o.prompt_tokens as "promptTokens",
  o.completion_tokens as "completionTokens",
  o.total_tokens as "totalTokens",
  o.unit,
  o.level,
  o.status_message as "statusMessage",
  o.version,
  o.model_id as "modelId",
  o.input_price as "inputPrice",
  o.output_price as "outputPrice",
  o.total_price as "totalPrice",
  o.calculated_input_cost as "calculatedInputCost",
  o.calculated_output_cost as "calculatedOutputCost",
  o.calculated_total_cost as "calculatedTotalCost",
  o."latency",
  o.prompt_id as "promptId",
  p.name as "promptName",
  p.version as "promptVersion"
FROM observations_view o
  JOIN traces t ON t.id = o.trace_id
  AND t.project_id = $2
  LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id
  and s_avg.observation_id = o.id
  LEFT JOIN prompts p ON p.id = o.prompt_id
  AND p.project_id = $3
WHERE o.project_id = $4
  AND o.type = 'GENERATION'
  AND o."start_time" > $5::timestamp with time zone at time zone 'UTC'
ORDER BY o."start_time" DESC NULLS LAST
LIMIT $6 OFFSET $7;
---sessions
SELECT s.id,
  s."created_at" AS "createdAt",
  s.bookmarked,
  s.public,
  t."userIds",
  t."countTraces",
  o."sessionDuration",
  o."totalCost" AS "totalCost",
  o."inputCost" AS "inputCost",
  o."outputCost" AS "outputCost",
  o."promptTokens" AS "promptTokens",
  o."completionTokens" AS "completionTokens",
  o."totalTokens" AS "totalTokens",
  (count(*) OVER ())::int AS "totalCount"
FROM trace_sessions AS s
  LEFT JOIN LATERAL (
    SELECT t.session_id,
      MAX(t."timestamp") AS "max_timestamp",
      MIN(t."timestamp") AS "min_timestamp",
      array_agg(t.id) AS "traceIds",
      array_agg(DISTINCT t.user_id) AS "userIds",
      count(t.id)::int AS "countTraces"
    FROM traces t
    WHERE t.project_id = $1
      AND t.session_id = s.id
    GROUP BY t.session_id
  ) AS t ON TRUE
  LEFT JOIN LATERAL (
    SELECT EXTRACT(
        EPOCH
        FROM COALESCE(
            MAX(o."end_time"),
            MAX(o."start_time"),
            t."max_timestamp"
          )
      ) - EXTRACT(
        EPOCH
        FROM COALESCE(MIN(o."start_time"), t."min_timestamp")
      )::double precision AS "sessionDuration",
      SUM(COALESCE(o."calculated_input_cost", 0)) AS "inputCost",
      SUM(COALESCE(o."calculated_output_cost", 0)) AS "outputCost",
      SUM(COALESCE(o."calculated_total_cost", 0)) AS "totalCost",
      SUM(o.prompt_tokens) AS "promptTokens",
      SUM(o.completion_tokens) AS "completionTokens",
      SUM(o.total_tokens) AS "totalTokens"
    FROM observations_view o
    WHERE o.project_id = $2
      AND o.trace_id = ANY (t."traceIds")
  ) AS o ON TRUE
WHERE s."project_id" = $3
  AND s."created_at" > $4::timestamp with time zone at time zone 'UTC'
ORDER BY s."created_at" DESC NULLS LAST
LIMIT $5 OFFSET $6