import { type TableDefinitions } from "@/src/server/api/interfaces/tableDefinition";

export const completionTokens = {
  name: "completionTokens",
  type: "number",
  internal: 'o."completion_tokens"',
} as const;
export const observationId = {
  name: "observationId",
  type: "string",
  internal: 'o."project_id"',
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
    'EXTRACT(EPOCH FROM o."end_time") * 1000 - EXTRACT(EPOCH FROM o."start_time") * 1000',
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

export const tableDefinitions: TableDefinitions = {
  traces: {
    table: ` traces t`,
    columns: [
      { name: "id", type: "string", internal: 't."id"' },
      tracesProjectId,
      traceVersion,
      release,
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
    ],
  },
  observations: {
    table: ` observations o`,
    columns: [
      traceId,
      observationName,
      { name: "type", type: "string", internal: 'o."type"' },
      completionTokens,
      {
        name: "promptTokens",
        type: "number",
        internal: 'o."prompt_tokens"',
      },
      {
        name: "totalTokens",
        type: "number",
        internal: 'o."total_tokens"',
      },
      observationId,
      { name: "model", type: "string", internal: 'o."model"' },
      observationsProjectId,
      startTime,
      { name: "endTime", type: "datetime", internal: 'o."end_time"' },
      duration,
    ],
  },
  traces_scores: {
    table: ` traces t JOIN scores s ON t.id = s.trace_id`,
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
