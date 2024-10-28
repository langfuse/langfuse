import { OptionsDefinition } from "../../tableDefinitions";

export type ClickhouseColumnDefinition = {
  name: string; // column name (camel case)
  clickhouse_mapping: string; // clickhouse column name (snake case)
  type: "number" | "string" | "datetime" | "boolean";
  nullable?: boolean;
};

export type TraceClickhouseRecord = {
  id: string;
  timestamp: string; // DateTime64(3)
  name: string;
  user_id?: string;
  metadata: Record<string, string>;
  release?: string;
  version?: string;
  project_id: string;
  public: boolean;
  bookmarked: boolean;
  tags: string[];
  input?: string;
  output?: string;
  session_id?: string;
  created_at: string; // DateTime64(3)
  updated_at: string; // DateTime64(3)
  event_ts: string; // DateTime64(3)
};

export type ObservationClickhouseRecord = {
  id: string;
  trace_id: string;
  project_id: string;
  type: string; // LowCardinality(String)
  parent_observation_id?: string;
  start_time: string; // DateTime64(3)
  end_time?: string; // Nullable(DateTime64(3))
  name: string;
  metadata: Record<string, string>;
  level: string; // LowCardinality(String)
  status_message?: string;
  version?: string;
  input?: string;
  output?: string;
  provided_model_name?: string;
  internal_model_id?: string;
  model_parameters?: string;
  provided_input_usage_units?: number; // Nullable(Decimal64(12))
  provided_output_usage_units?: number; // Nullable(Decimal64(12))
  provided_total_usage_units?: number; // Nullable(Decimal64(12))
  input_usage_units?: number; // Nullable(Decimal64(12))
  output_usage_units?: number; // Nullable(Decimal64(12))
  total_usage_units?: number; // Nullable(Decimal64(12))
  unit?: string;
  provided_input_cost?: number; // Nullable(Decimal64(12))
  provided_output_cost?: number; // Nullable(Decimal64(12))
  provided_total_cost?: number; // Nullable(Decimal64(12))
  input_cost?: number; // Nullable(Decimal64(12))
  output_cost?: number; // Nullable(Decimal64(12))
  total_cost?: number; // Nullable(Decimal64(12))
  completion_start_time?: string; // Nullable(DateTime64(3))
  prompt_id?: string;
  prompt_name?: string;
  prompt_version?: number; // Nullable(UInt16)
  created_at: string; // DateTime64(3)
  updated_at: string; // DateTime64(3)
  event_ts: string; // DateTime64(3)
};

export type ScoreClickhouseRecord = {
  id: string;
  timestamp: string; // DateTime64(3)
  project_id: string;
  trace_id: string;
  observation_id?: string;
  name: string;
  value: number;
  source: string;
  comment?: string;
  author_user_id?: string;
  config_id?: string;
  data_type: string;
  string_value?: string;
  created_at: string; // DateTime64(3)
  updated_at: string; // DateTime64(3)
  event_ts: string; // DateTime64(3)
};

export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;

export const isValidTableName = (
  tableName: string
): tableName is ClickhouseTableName =>
  Object.keys(ClickhouseTableNames).includes(tableName);

export type ClickhouseTables = {
  traces: keyof TraceClickhouseRecord;
  observations: keyof ObservationClickhouseRecord;
  scores: keyof ScoreClickhouseRecord;
};

export function isKeyOfTraceClickhouseRecord(
  key: string
): key is keyof TraceClickhouseRecord {
  const validKeys = TraceClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof TraceClickhouseRecord);
}

export function isKeyOfObservationClickhouseRecord(
  key: string
): key is keyof ObservationClickhouseRecord {
  const validKeys = ObservationClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof ObservationClickhouseRecord);
}

export function isKeyOfScoreClickhouseRecord(
  key: string
): key is keyof ScoreClickhouseRecord {
  const validKeys = ScoreClickhouseColumns.map((column) => column.name);
  return validKeys.includes(key as keyof ScoreClickhouseRecord);
}

export function isKeyOfClickhouseRecord(
  tableName: ClickhouseTableName,
  key: string
): key is
  | keyof TraceClickhouseRecord
  | keyof ObservationClickhouseRecord
  | keyof ScoreClickhouseRecord {
  switch (tableName) {
    case "traces":
      return isKeyOfTraceClickhouseRecord(key);
    case "observations":
      return isKeyOfObservationClickhouseRecord(key);
    case "scores":
      return isKeyOfScoreClickhouseRecord(key);
    default:
      throw new Error(`Unhandled table case: ${tableName}`);
  }
}

export const TraceClickhouseColumns: ClickhouseColumnDefinition[] = [
  { name: "id", clickhouse_mapping: "id", type: "string" },
  { name: "timestamp", clickhouse_mapping: "timestamp", type: "datetime" },
  { name: "name", clickhouse_mapping: "name", type: "string" },
  {
    name: "user_id",
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
  { name: "project_id", clickhouse_mapping: "project_id", type: "string" },
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
    name: "session_id",
    clickhouse_mapping: "session_id",
    type: "string",
    nullable: true,
  },
  { name: "created_at", clickhouse_mapping: "created_at", type: "datetime" },
  { name: "updated_at", clickhouse_mapping: "updated_at", type: "datetime" },
  { name: "event_ts", clickhouse_mapping: "event_ts", type: "datetime" },
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
    name: "providedInputUsageUnits",
    clickhouse_mapping: "provided_input_usage_units",
    type: "number",
    nullable: true,
  },
  {
    name: "providedOutputUsageUnits",
    clickhouse_mapping: "provided_output_usage_units",
    type: "number",
    nullable: true,
  },
  {
    name: "providedTotalUsageUnits",
    clickhouse_mapping: "provided_total_usage_units",
    type: "number",
    nullable: true,
  },
  {
    name: "inputUsageUnits",
    clickhouse_mapping: "input_usage_units",
    type: "number",
    nullable: true,
  },
  {
    name: "outputUsageUnits",
    clickhouse_mapping: "output_usage_units",
    type: "number",
    nullable: true,
  },
  {
    name: "totalUsageUnits",
    clickhouse_mapping: "total_usage_units",
    type: "number",
    nullable: true,
  },
  { name: "unit", clickhouse_mapping: "unit", type: "string", nullable: true },
  {
    name: "providedInputCost",
    clickhouse_mapping: "provided_input_cost",
    type: "number",
    nullable: true,
  },
  {
    name: "providedOutputCost",
    clickhouse_mapping: "provided_output_cost",
    type: "number",
    nullable: true,
  },
  {
    name: "providedTotalCost",
    clickhouse_mapping: "provided_total_cost",
    type: "number",
    nullable: true,
  },
  {
    name: "inputCost",
    clickhouse_mapping: "input_cost",
    type: "number",
    nullable: true,
  },
  {
    name: "outputCost",
    clickhouse_mapping: "output_cost",
    type: "number",
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
