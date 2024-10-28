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

export type ObservationWide = {
  id: string;
  trace_id?: string;
  name?: string;
  project_id: string;
  user_id?: string;
  metadata: Record<string, string>;
  release?: string;
  version?: string;
  public: boolean;
  bookmarked: boolean;
  tags: string[];
  input?: string;
  output?: string;
  session_id?: string;
  created_at: string; // DateTime64(3)
  updated_at: string; // DateTime64(3)
  event_ts: string; // DateTime64(3)
  type: string; // LowCardinality(String)
  parent_observation_id?: string;
  start_time: string; // DateTime64(3)
  end_time?: string; // Nullable(DateTime64(3))
  level: string; // LowCardinality(String)
  status_message?: string;
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
  trace_timestamp: string; // DateTime64(3)
  trace_name: string;
  trace_user_id?: string;
  trace_metadata: Record<string, string>;
  trace_release?: string;
  trace_version?: string;
  trace_public: boolean;
  trace_bookmarked: boolean;
  trace_tags: string[];
  trace_input?: string;
  trace_output?: string;
  trace_session_id?: string;
  trace_event_ts: string; // DateTime64(3)
};

export const ClickhouseTableNames = {
  traces: "traces",
  observations: "observations",
  scores: "scores",
} as const;

export type ClickhouseTableName = keyof typeof ClickhouseTableNames;

export type ClickhouseTables = {
  traces: TraceClickhouseRecord;
  observations: ObservationClickhouseRecord;
  scores: ScoreClickhouseRecord;
};

type TraceKeys = keyof TraceClickhouseRecord;

const isTraceColumn = (columnName: string): columnName is TraceKeys => {
  return columnName in ({} as TraceClickhouseRecord);
};
