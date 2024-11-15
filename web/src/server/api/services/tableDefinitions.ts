import { type ColumnDefinition, type TableDefinitions } from "@langfuse/shared";

export const completionTokens = {
  name: "completionTokens",
  id: "completionTokens",
  type: "number",
  internal: 'o."completion_tokens"',
} as const;
export const observationId = {
  name: "observationId",
  id: "observationId",
  type: "string",
  internal: 'o."id"',
} as const;
export const observationName = {
  name: "name",
  id: "name",
  type: "string",
  internal: 'o."name"',
} as const;
export const startTime = {
  name: "startTime",
  id: "startTime",
  type: "datetime",
  internal: 'o."start_time"',
} as const;
export const traceId = {
  name: "traceId",
  id: "traceId",
  type: "string",
  internal: 't."id"',
} as const;
export const traceVersion = {
  name: "Version",
  id: "version",
  type: "string",
  internal: 't."version"',
} as const;
export const traceTimestamp = {
  name: "timestamp",
  id: "timestamp",
  type: "string",
  internal: 't."timestamp"',
} as const;
const scoreTimestamp = {
  name: "scoreTimestamp",
  id: "scoreTimestamp",
  type: "string",
  internal: 's."timestamp"',
} as const;
export const scoreName = {
  name: "scoreName",
  id: "scoreName",
  type: "string",
  internal: 's."name"',
} as const;
export const duration = {
  name: "duration",
  id: "duration",
  type: "number",
  internal:
    'EXTRACT(EPOCH FROM o."end_time") - EXTRACT(EPOCH FROM o."start_time")',
} as const;
export const release = {
  name: "Release",
  id: "release",
  type: "string",
  internal: 't."release"',
} as const;
export const tracesProjectId = {
  name: "tracesProjectId",
  id: "tracesProjectId",
  type: "string",
  internal: 't."project_id"',
} as const;
export const observationsProjectId = {
  name: "observationsProjectId",
  id: "observationsProjectId",
  type: "string",
  internal: 'o."project_id"',
} as const;
const scoreId = {
  name: "scoreId",
  id: "scoreId",
  type: "string",
  internal: 's."id"',
} as const;
const scoreSource = {
  name: "scoreSource",
  id: "scoreSource",
  type: "string",
  internal: 's."source"::text',
} as const;
const scoreDataType = {
  name: "scoreDataType",
  id: "scoreDataType",
  type: "string",
  internal: 's."data_type"::text',
} as const;
const scoreStringValue = {
  name: "stringValue",
  id: "stringValue",
  type: "string",
  internal: 's."string_value"',
} as const;
export const traceName = {
  name: "Trace Name",
  id: "traceName",
  type: "string",
  internal: 't."name"',
} as const;
export const totalTokens = {
  name: "totalTokens",
  id: "totalTokens",
  type: "number",
  internal: 'o."total_tokens"',
} as const;
export const model = {
  name: "model",
  id: "model",
  type: "string",
  internal: 'o."model"',
} as const;
export const traceUser = {
  name: "User",
  id: "user",
  type: "string",
  internal: 't."user_id"',
} as const;

export const calculatedTotalCost = {
  name: "calculatedTotalCost",
  id: "calculatedTotalCost",
  type: "number",
  internal: 'o."calculated_total_cost"',
} as const;

export const traceTags = {
  name: "Tags",
  id: "tags",
  type: "string",
  internal: 't."tags"',
} as const;

const tracesObservationsColumns: ColumnDefinition[] = [
  traceId,
  observationId,
  { name: "type", id: "type", type: "string", internal: 'o."type"' },
  tracesProjectId,
  observationsProjectId,
  duration,
  totalTokens,
  calculatedTotalCost,
  model,
  traceTimestamp,
  traceUser,
  startTime,
  traceName,
  observationName,
  traceTags,
  release,
  traceVersion,
];

const tracesColumns = [
  tracesProjectId,
  traceVersion,
  release,
  traceId,
  traceTimestamp,
  traceName,
  traceUser,
  traceTags,
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
      { name: "type", id: "type", type: "string", internal: 'o."type"' },
      completionTokens,
      {
        name: "promptTokens",
        type: "number",
        id: "promptTokens",
        internal: 'o."prompt_tokens"',
      },
      totalTokens,
      observationId,
      model,
      observationsProjectId,
      startTime,
      {
        name: "endTime",
        id: "endTime",
        type: "datetime",
        internal: 'o."end_time"',
      },
      duration,
    ],
  },
  traces_metrics: {
    table: `traces_view t`,
    columns: [
      ...tracesColumns,
      {
        name: "duration",
        id: "duration",
        type: "number",
        internal: '"duration"',
      },
    ],
  },
  traces_scores: {
    table: ` traces t JOIN scores s ON t.id = s.trace_id AND t.project_id = s.project_id`,
    columns: [
      tracesProjectId,
      { name: "value", id: "value", type: "number", internal: 's."value"' },
      scoreSource,
      scoreDataType,
      scoreStringValue,
      scoreId,
      traceVersion,
      scoreTimestamp,
      traceTimestamp,
      release,
      scoreName,
      traceUser,
      tracesProjectId,
      traceName,
      traceTags,
    ],
  },

  traces_parent_observation_scores: {
    table: ` traces t LEFT JOIN observations_view o on t."id" = o."trace_id" and o."parent_observation_id" is NULL AND t.project_id = o.project_id LEFT JOIN scores s ON t."id" = s."trace_id" AND t.project_id = s.project_id`,
    columns: [
      {
        name: "projectId",
        id: "projectId",
        type: "string",
        internal: 't."project_id"',
      },
      { name: "value", id: "value", type: "number", internal: 's."value"' },
      {
        name: "name",
        id: "name",
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
      traceTags,
    ],
  },

  // definition required only for internal mapping of dataset eval filters
  dataset_items: {
    table: ` dataset_items di`,
    columns: [
      {
        name: "Dataset",
        id: "datasetId",
        type: "string",
        internal: 'di."dataset_id"',
      },
    ],
  },
};
