import { type TableDefinitions } from "@/src/server/api/interfaces/tableDefinition";

export const completionTokens = {
  name: "completionTokens",
  type: "number",
  internal: 'o."completion_tokens"',
} as const;
export const observationId = {
  name: "observationId",
  type: "string",
  internal: 'o."id"',
} as const;
export const observationName = {
  name: "name",
  type: "string",
  internal: 'o."name"',
} as const;
export const startTime = {
  name: "startTime",
  type: "datetime",
  internal: 'o."start_time"',
} as const;
export const traceId = {
  name: "traceId",
  type: "string",
  internal: 't."id"',
} as const;
export const traceVersion = {
  name: "version",
  type: "string",
  internal: 't."version"',
} as const;
export const traceTimestamp = {
  name: "timestamp",
  type: "string",
  internal: 't."timestamp"',
} as const;
export const scoreName = {
  name: "scoreName",
  type: "string",
  internal: 's."name"',
} as const;
export const duration = {
  name: "duration",
  type: "number",
  internal:
    'EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time")',
} as const;
export const release = {
  name: "release",
  type: "string",
  internal: 't."release"',
} as const;
export const tracesProjectId = {
  name: "tracesProjectId",
  type: "string",
  internal: 't."project_id"',
} as const;
export const observationsProjectId = {
  name: "observationsProjectId",
  type: "string",
  internal: 'o."project_id"',
} as const;
export const scoreId = {
  name: "scoreId",
  type: "string",
  internal: 's."id"',
} as const;
export const traceName = {
  name: "traceName",
  type: "string",
  internal: 't."name"',
} as const;
export const totalTokens = {
  name: "totalTokens",
  type: "number",
  internal: 'o."total_tokens"',
} as const;
export const model = {
  name: "model",
  type: "string",
  internal: 'o."model"',
} as const;
export const traceUser = {
  name: "user",
  type: "string",
  internal: 't."user_id"',
} as const;

export const totalTokenCost = {
  name: "totalTokenCost",
  type: "number",
  internal: `
  sum(
    CASE
      -- Finetuned
      WHEN (o."model" LIKE '%ada:%') THEN 0.0016 * o."prompt_tokens" + 0.0016 * o."completion_tokens"
      WHEN (o."model" LIKE '%babbage:%') THEN 0.0024 * o."prompt_tokens" + 0.0024 * o."completion_tokens"
      WHEN (o."model" LIKE '%curie:%') THEN 0.012 * o."prompt_tokens" + 0.012 * o."completion_tokens"
      WHEN (o."model" LIKE '%davinci:%') THEN 0.12 * o."prompt_tokens" + 0.12 * o."completion_tokens"
      -- Non-finetuned
      WHEN (o."model" LIKE '%gpt-4-32k%') THEN 0.06 * o."prompt_tokens" + 0.12 * o."completion_tokens"
      WHEN (o."model" LIKE '%gpt-3.5-turbo-0613%') THEN 0.0015 * o."prompt_tokens" + 0.002 * o."completion_tokens"
      WHEN (o."model" LIKE '%gpt-3.5-turbo-16k-0613%') THEN 0.003 * o."prompt_tokens" + 0.004 * o."completion_tokens"
      WHEN (o."model" LIKE '%text-embedding-ada-002%') THEN 0.0001 * o."prompt_tokens" + 0.0001 * coalesce(o."completion_tokens", 0)
      WHEN (o."model" LIKE '%ada%') THEN 0.0001 * o."prompt_tokens" + 0.0001 * o."completion_tokens"
      WHEN (o."model" LIKE '%babbage%') THEN 0.0005 * o."prompt_tokens" + 0.0005 * o."completion_tokens"
      WHEN (o."model" LIKE '%curie%') THEN 0.002 * o."prompt_tokens" + 0.002 * o."completion_tokens"
      WHEN (o."model" LIKE '%davinci%') THEN 0.02 * o."prompt_tokens" + 0.02 * o."completion_tokens"
      WHEN (o."model" LIKE '%gpt-3.5-turbo%') THEN 0.0015 * o."prompt_tokens" + 0.002 * o."completion_tokens"
      WHEN (o."model" LIKE '%gpt-35-turbo%') THEN 0.0015 * o."prompt_tokens" + 0.002 * o."completion_tokens"
      WHEN (o."model" LIKE '%gpt-4%') THEN 0.03 * o."prompt_tokens" + 0.06 * o."completion_tokens"
      WHEN (o."model" LIKE '%claude-1%') THEN 0.01102 * o."prompt_tokens" + 0.03268 * o."completion_tokens"
      WHEN (o."model" LIKE '%claude-2%') THEN 0.01102 * o."prompt_tokens" + 0.03268 * o."completion_tokens"
      WHEN (o."model" LIKE '%claude-instant-1%') THEN 0.00163 * o."prompt_tokens" + 0.00551 * o."completion_tokens"
      WHEN (o."model" LIKE '%bison%') THEN 0.0005 * LENGTH(REPLACE(o."input"::text, ' ', '')) + 0.0005 * LENGTH(REPLACE(o."output"::text, ' ', ''))
      ELSE 0
    END
    ) / 1000
    `,
} as const;

export const tableDefinitions: TableDefinitions = {
  traces: {
    table: ` traces t`,
    columns: [
      tracesProjectId,
      traceVersion,
      release,
      traceId,
      traceTimestamp,
      traceName,
      traceUser,
    ],
  },
  traces_observations: {
    table: ` traces t LEFT JOIN observations o ON t.id = o.trace_id`,
    columns: [
      traceId,
      observationId,
      { name: "type", type: "string", internal: 'o."type"' },
      tracesProjectId,
      observationsProjectId,
      duration,
      totalTokenCost,
      totalTokens,
      model,
      traceTimestamp,
      traceUser,
      startTime,
    ],
  },
  observations: {
    table: ` observations o`,
    columns: [
      traceId,
      totalTokenCost,
      observationName,
      { name: "type", type: "string", internal: 'o."type"' },
      completionTokens,
      {
        name: "promptTokens",
        type: "number",
        internal: 'o."prompt_tokens"',
      },
      totalTokens,
      observationId,
      model,
      observationsProjectId,
      startTime,
      { name: "endTime", type: "datetime", internal: 'o."end_time"' },
      duration,
    ],
  },
  traces_scores: {
    table: ` traces t JOIN scores s ON t.id = s.trace_id`,
    columns: [
      tracesProjectId,
      { name: "value", type: "number", internal: 's."value"' },
      {
        name: "scoreName",
        type: "number",
        internal: 's."name"',
      },
      scoreId,
      traceVersion,
      traceTimestamp,
      scoreName,
      traceUser,
      tracesProjectId,
    ],
  },
  traces_parent_observation_scores: {
    table: ` traces t LEFT JOIN observations o on t."id" = o."trace_id" and o."parent_observation_id" is NULL LEFT JOIN scores s ON t."id" = s."trace_id"`,
    columns: [
      { name: "projectId", type: "string", internal: 't."project_id"' },
      { name: "value", type: "number", internal: 's."value"' },
      {
        name: "name",
        type: "number",
        internal: 's."name"',
      },
      traceVersion,
      traceTimestamp,
      scoreName,
      duration,
      release,
      tracesProjectId,
      observationsProjectId,
    ],
  },
};
