import { z } from "zod";

export const TraceClickhouseRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(), // DateTime64(3)
  name: z.string(),
  user_id: z.string().optional(),
  metadata: z.record(z.string()),
  release: z.string().optional(),
  version: z.string().optional(),
  project_id: z.string(),
  public: z.boolean(),
  bookmarked: z.boolean(),
  tags: z.array(z.string()),
  input: z.string().optional(),
  output: z.string().optional(),
  session_id: z.string().optional(),
  created_at: z.string(), // DateTime64(3)
  updated_at: z.string(), // DateTime64(3)
  event_ts: z.string(), // DateTime64(3)
});

export type TraceClickhouseRecord = z.infer<typeof TraceClickhouseRecordSchema>;

export const ObservationClickhouseRecordSchema = z.object({
  id: z.string(),
  trace_id: z.string(),
  project_id: z.string(),
  type: z.string(), // LowCardinality(String)
  parent_observation_id: z.string().optional(),
  start_time: z.string(), // DateTime64(3)
  end_time: z.string().optional(), // Nullable(DateTime64(3))
  name: z.string(),
  metadata: z.record(z.string()),
  level: z.string(), // LowCardinality(String)
  status_message: z.string().optional(),
  version: z.string().optional(),
  input: z.string().optional(),
  output: z.string().optional(),
  provided_model_name: z.string().optional(),
  internal_model_id: z.string().optional(),
  model_parameters: z.string().optional(),
  provided_usage_details: z.record(z.number()).optional(), // Map(LowCardinality(String), UInt64)
  usage_details: z.record(z.number()).optional(), // Map(LowCardinality(String), UInt64)
  provided_cost_details: z.record(z.number()).optional(), // Map(LowCardinality(String), Decimal64(12))
  cost_details: z.record(z.number()).optional(), // Map(LowCardinality(String), Decimal64(12))
  total_cost: z.number().optional(), // Nullable(Decimal64(12))
  completion_start_time: z.string().optional(), // Nullable(DateTime64(3))
  prompt_id: z.string().optional(),
  prompt_name: z.string().optional(),
  prompt_version: z.number().optional(), // Nullable(UInt16)
  created_at: z.string(), // DateTime64(3)
  updated_at: z.string(), // DateTime64(3)
  event_ts: z.string(), // DateTime64(3)
});

export type ObservationClickhouseRecord = z.infer<
  typeof ObservationClickhouseRecordSchema
>;

export const ScoreClickhouseRecordSchema = z.object({
  id: z.string(),
  timestamp: z.string(), // DateTime64(3)
  project_id: z.string(),
  trace_id: z.string(),
  observation_id: z.string().optional(),
  name: z.string(),
  value: z.number(),
  source: z.string(),
  comment: z.string().optional(),
  author_user_id: z.string().optional(),
  config_id: z.string().optional(),
  data_type: z.string(),
  string_value: z.string().optional(),
  created_at: z.string(), // DateTime64(3)
  updated_at: z.string(), // DateTime64(3)
  event_ts: z.string(), // DateTime64(3)
});

export type ScoreClickhouseRecord = z.infer<typeof ScoreClickhouseRecordSchema>;

export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;

export const ClickhouseColumnDefinitionSchema = z.object({
  name: z.string(), // column name (camel case)
  clickhouse_mapping: z.string(), // clickhouse column name (snake case)
  type: z.enum(["number", "string", "datetime", "boolean", "map"]),
  nullable: z.boolean().optional(),
});

export type ClickhouseColumnDefinition = z.infer<
  typeof ClickhouseColumnDefinitionSchema
>;

export const TraceClickhouseColumns: ClickhouseColumnDefinition[] = [
  { name: "id", clickhouse_mapping: "id", type: "string" },
  { name: "timestamp", clickhouse_mapping: "timestamp", type: "datetime" },
  { name: "name", clickhouse_mapping: "name", type: "string" },
  {
    name: "userId",
    clickhouse_mapping: "user_id",
    type: "string",
    nullable: true,
  },
  { name: "metadata", clickhouse_mapping: "metadata", type: "string" },
  {
    name: "release",
    clickhouse_mapping: "release",
    type: "string",
    nullable: true,
  },
  {
    name: "version",
    clickhouse_mapping: "version",
    type: "string",
    nullable: true,
  },
  { name: "projectId", clickhouse_mapping: "project_id", type: "string" },
  { name: "public", clickhouse_mapping: "public", type: "boolean" },
  { name: "bookmarked", clickhouse_mapping: "bookmarked", type: "boolean" },
  { name: "tags", clickhouse_mapping: "tags", type: "string" },
  {
    name: "input",
    clickhouse_mapping: "input",
    type: "string",
    nullable: true,
  },
  {
    name: "output",
    clickhouse_mapping: "output",
    type: "string",
    nullable: true,
  },
  {
    name: "sessionId",
    clickhouse_mapping: "session_id",
    type: "string",
    nullable: true,
  },
  { name: "createdAt", clickhouse_mapping: "created_at", type: "datetime" },
  { name: "updatedAt", clickhouse_mapping: "updated_at", type: "datetime" },
  { name: "eventTs", clickhouse_mapping: "event_ts", type: "datetime" },
  { name: "level", clickhouse_mapping: "level", type: "string" },
];

export const ObservationClickhouseColumns: ClickhouseColumnDefinition[] = [
  { name: "id", clickhouse_mapping: "id", type: "string" },
  { name: "traceId", clickhouse_mapping: "trace_id", type: "string" },
  { name: "projectId", clickhouse_mapping: "project_id", type: "string" },
  { name: "type", clickhouse_mapping: "type", type: "string" },
  {
    name: "parentObservationId",
    clickhouse_mapping: "parent_observation_id",
    type: "string",
    nullable: true,
  },
  { name: "startTime", clickhouse_mapping: "start_time", type: "datetime" },
  {
    name: "endTime",
    clickhouse_mapping: "end_time",
    type: "datetime",
    nullable: true,
  },
  { name: "name", clickhouse_mapping: "name", type: "string" },
  { name: "metadata", clickhouse_mapping: "metadata", type: "string" },
  { name: "level", clickhouse_mapping: "level", type: "string" },
  {
    name: "statusMessage",
    clickhouse_mapping: "status_message",
    type: "string",
    nullable: true,
  },
  {
    name: "version",
    clickhouse_mapping: "version",
    type: "string",
    nullable: true,
  },
  {
    name: "input",
    clickhouse_mapping: "input",
    type: "string",
    nullable: true,
  },
  {
    name: "output",
    clickhouse_mapping: "output",
    type: "string",
    nullable: true,
  },
  {
    name: "providedModelName",
    clickhouse_mapping: "provided_model_name",
    type: "string",
    nullable: true,
  },
  {
    name: "internalModelId",
    clickhouse_mapping: "internal_model_id",
    type: "string",
    nullable: true,
  },
  {
    name: "modelParameters",
    clickhouse_mapping: "model_parameters",
    type: "string",
    nullable: true,
  },
  {
    name: "providedUsageDetails",
    clickhouse_mapping: "provided_usage_details",
    type: "map",
    nullable: true,
  },
  {
    name: "usageDetails",
    clickhouse_mapping: "usage_details",
    type: "map",
    nullable: true,
  },
  {
    name: "providedCostDetails",
    clickhouse_mapping: "provided_cost_details",
    type: "map",
    nullable: true,
  },
  {
    name: "costDetails",
    clickhouse_mapping: "cost_details",
    type: "map",
    nullable: true,
  },
  {
    name: "totalCost",
    clickhouse_mapping: "total_cost",
    type: "number",
    nullable: true,
  },
  {
    name: "completionStartTime",
    clickhouse_mapping: "completion_start_time",
    type: "datetime",
    nullable: true,
  },
  {
    name: "promptId",
    clickhouse_mapping: "prompt_id",
    type: "string",
    nullable: true,
  },
  {
    name: "promptName",
    clickhouse_mapping: "prompt_name",
    type: "string",
    nullable: true,
  },
  {
    name: "promptVersion",
    clickhouse_mapping: "prompt_version",
    type: "number",
    nullable: true,
  },
  { name: "createdAt", clickhouse_mapping: "created_at", type: "datetime" },
  { name: "updatedAt", clickhouse_mapping: "updated_at", type: "datetime" },
  { name: "eventTs", clickhouse_mapping: "event_ts", type: "datetime" },
];

export const ScoreClickhouseColumns: ClickhouseColumnDefinition[] = [
  { name: "id", clickhouse_mapping: "id", type: "string" },
  { name: "timestamp", clickhouse_mapping: "timestamp", type: "datetime" },
  { name: "projectId", clickhouse_mapping: "project_id", type: "string" },
  { name: "traceId", clickhouse_mapping: "trace_id", type: "string" },
  {
    name: "observationId",
    clickhouse_mapping: "observation_id",
    type: "string",
    nullable: true,
  },
  { name: "name", clickhouse_mapping: "name", type: "string" },
  { name: "value", clickhouse_mapping: "value", type: "number" },
  { name: "source", clickhouse_mapping: "source", type: "string" },
  {
    name: "comment",
    clickhouse_mapping: "comment",
    type: "string",
    nullable: true,
  },
  {
    name: "authorUserId",
    clickhouse_mapping: "author_user_id",
    type: "string",
    nullable: true,
  },
  {
    name: "configId",
    clickhouse_mapping: "config_id",
    type: "string",
    nullable: true,
  },
];
