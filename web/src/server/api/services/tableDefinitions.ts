import {
  type ColumnDefinition,
  type TableDefinitions,
} from "@/src/server/api/interfaces/tableDefinition";

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

export const calculatedTotalCost = {
  name: "calculatedTotalCost",
  type: "number",
  internal: 'o."calculated_total_cost"',
} as const;

const tracesObservationsColumns: ColumnDefinition[] = [
  traceId,
  observationId,
  { name: "type", type: "string", internal: 'o."type"' },
  tracesProjectId,
  observationsProjectId,
  duration,
  totalTokens,
  model,
  traceTimestamp,
  traceUser,
  startTime,
  traceName,
  observationName,
];

const tracesColumns = [
  tracesProjectId,
  traceVersion,
  release,
  traceId,
  traceTimestamp,
  traceName,
  traceUser,
];

export const tableDefinitions: TableDefinitions = {
  traces: {
    table: ` traces t`,
    columns: tracesColumns,
  },
  traces_observations: {
    table: ` traces t LEFT JOIN observations o ON t.id = o.trace_id`,
    columns: tracesObservationsColumns,
  },
  traces_observationsview: {
    table: ` traces t LEFT JOIN observations_view o ON t.id = o.trace_id`,
    columns: [...tracesObservationsColumns, calculatedTotalCost],
  },
  observations: {
    table: ` observations_view o`,
    columns: [
      traceId,
      calculatedTotalCost,
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
  traces_metrics: {
    table: `traces_view t`,
    columns: [
      ...tracesColumns,
      { name: "duration", type: "number", internal: '"duration"' },
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
      traceName,
    ],
  },

  traces_parent_observation_scores: {
    table: ` traces t LEFT JOIN observations_view o on t."id" = o."trace_id" and o."parent_observation_id" is NULL LEFT JOIN scores s ON t."id" = s."trace_id"`,
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
