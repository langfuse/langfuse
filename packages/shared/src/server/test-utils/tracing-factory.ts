import { v4 } from "uuid";
import { toClickhouseDateTime } from "../clickhouse/client";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
} from "../repositories/definitions";
import { UNKNOWN_INGESTION_SDK_VALUE } from "../ingestion/ingestionAttribution";

type DateTimeInput = Date | number | string;

type WithDateTimeInputs<T, K extends keyof T> = Omit<Partial<T>, K> & {
  [P in K]?: DateTimeInput | null;
};

// Test fixtures historically passed events_full ticks as microseconds.
// Numbers above 1e14 cannot be unix milliseconds in the DateTime64 range.
const toEventClickhouseDateTime = (value?: DateTimeInput | null): string => {
  if (typeof value === "number" && Math.abs(value) > 1e14) {
    return toClickhouseDateTime(Math.trunc(value / 1000));
  }
  return toClickhouseDateTime(value);
};

export const createTrace = (
  trace: WithDateTimeInputs<
    TraceRecordInsertType,
    "timestamp" | "created_at" | "updated_at" | "event_ts"
  >,
): TraceRecordInsertType => {
  const { timestamp, created_at, updated_at, event_ts, ...rest } = trace;
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    timestamp: toClickhouseDateTime(timestamp),
    environment: "default",
    metadata: {
      source: "API",
      server: "Node",
    },
    public: false,
    bookmarked: true,
    name: "test-trace" + v4(),
    tags: ["john", "doe"],
    release: "1.0.0",
    version: "2",
    user_id: v4(),
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    event_ts: toClickhouseDateTime(event_ts),
    is_deleted: 0,
    ...rest,
  };
};

export const createDatasetRunItem = (
  datasetRunItem: WithDateTimeInputs<
    DatasetRunItemRecordInsertType,
    | "created_at"
    | "updated_at"
    | "event_ts"
    | "dataset_run_created_at"
    | "dataset_item_version"
  >,
): DatasetRunItemRecordInsertType => {
  const {
    created_at,
    updated_at,
    event_ts,
    dataset_run_created_at,
    dataset_item_version,
    ...rest
  } = datasetRunItem;
  return {
    id: v4(),
    project_id: v4(),
    trace_id: v4(),
    observation_id: null,
    dataset_run_id: v4(),
    dataset_item_id: v4(),
    dataset_id: v4(),
    dataset_run_name: "test-run-name" + v4(),
    dataset_run_metadata: { key: "value" },
    dataset_item_input: "{}",
    dataset_item_expected_output: "{}",
    dataset_item_metadata: { key: "value" },
    dataset_run_created_at: toClickhouseDateTime(dataset_run_created_at),
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    event_ts: toClickhouseDateTime(event_ts),
    dataset_item_version: dataset_item_version
      ? toClickhouseDateTime(dataset_item_version)
      : undefined,
    is_deleted: 0,
    error: datasetRunItem.error ?? null,
    ...rest,
  };
};

export const createObservation = (
  observation: WithDateTimeInputs<
    ObservationRecordInsertType,
    | "created_at"
    | "updated_at"
    | "start_time"
    | "end_time"
    | "completion_start_time"
    | "event_ts"
  >,
): ObservationRecordInsertType => {
  const {
    created_at,
    updated_at,
    start_time,
    end_time,
    completion_start_time,
    event_ts,
    ...rest
  } = observation;
  return {
    id: v4(),
    trace_id: v4(),
    project_id: v4(),
    type: "GENERATION",
    environment: "default",
    metadata: {
      source: "API",
      server: "Node",
    },
    provided_usage_details: { input: 1234, output: 5678, total: 6912 },
    provided_cost_details: { input: 100, output: 200, total: 300 },
    usage_details: { input: 1234, output: 5678, total: 6912 },
    cost_details: { input: 100, output: 200, total: 300 },
    is_deleted: 0,
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    start_time: toClickhouseDateTime(start_time),
    event_ts: toClickhouseDateTime(event_ts),
    name: "sample_name" + v4(),
    level: "DEFAULT",
    status_message: "status",
    version: "1.0",
    input: "Hello World",
    output: "Hello John",
    provided_model_name: "gpt-3.5-turbo",
    internal_model_id: v4(),
    model_parameters: '{"something":"sample_param"}',
    total_cost: 300,
    prompt_id: v4(),
    prompt_name: "generation-prompt",
    prompt_version: 1,
    end_time: end_time === null ? null : toClickhouseDateTime(end_time),
    completion_start_time:
      completion_start_time === null
        ? null
        : toClickhouseDateTime(completion_start_time),
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],
    ...rest,
  };
};

export const createTraceScore = (
  score: WithDateTimeInputs<
    ScoreRecordInsertType,
    "timestamp" | "created_at" | "updated_at" | "event_ts"
  >,
): ScoreRecordInsertType => {
  const { timestamp, created_at, updated_at, event_ts, ...rest } = score;
  return {
    id: v4(),
    project_id: v4(),
    trace_id: v4(),
    observation_id: null, // Trace-level scores must have observation_id as null by default
    environment: "default",
    name: "test-score" + v4(),
    timestamp: toClickhouseDateTime(timestamp),
    value: 100.5,
    string_value: null,
    long_string_value: "",
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    event_ts: toClickhouseDateTime(event_ts),
    ingestion_api_key: "",
    ingestion_sdk_name: UNKNOWN_INGESTION_SDK_VALUE,
    ingestion_sdk_version: UNKNOWN_INGESTION_SDK_VALUE,
    is_deleted: 0,
    ...rest,
    session_id: null,
    dataset_run_id: null,
  };
};

export const createSessionScore = (
  score: WithDateTimeInputs<
    ScoreRecordInsertType,
    "timestamp" | "created_at" | "updated_at" | "event_ts"
  >,
): ScoreRecordInsertType => {
  const { timestamp, created_at, updated_at, event_ts, ...rest } = score;
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    environment: "default",
    name: "test-session-score" + v4(),
    timestamp: toClickhouseDateTime(timestamp),
    value: 100.5,
    long_string_value: "",
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    event_ts: toClickhouseDateTime(event_ts),
    ingestion_api_key: "",
    ingestion_sdk_name: UNKNOWN_INGESTION_SDK_VALUE,
    ingestion_sdk_version: UNKNOWN_INGESTION_SDK_VALUE,
    is_deleted: 0,
    ...rest,
    observation_id: null,
    trace_id: null,
    dataset_run_id: null,
  };
};

export const createDatasetRunScore = (
  score: WithDateTimeInputs<
    ScoreRecordInsertType,
    "timestamp" | "created_at" | "updated_at" | "event_ts"
  >,
): ScoreRecordInsertType => {
  const { timestamp, created_at, updated_at, event_ts, ...rest } = score;
  return {
    id: v4(),
    project_id: v4(),
    dataset_run_id: v4(),
    environment: "default",
    name: "test-run-score" + v4(),
    timestamp: toClickhouseDateTime(timestamp),
    value: 100.5,
    long_string_value: "",
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: toClickhouseDateTime(created_at),
    updated_at: toClickhouseDateTime(updated_at),
    event_ts: toClickhouseDateTime(event_ts),
    ingestion_api_key: "",
    ingestion_sdk_name: UNKNOWN_INGESTION_SDK_VALUE,
    ingestion_sdk_version: UNKNOWN_INGESTION_SDK_VALUE,
    is_deleted: 0,
    ...rest,
    observation_id: null,
    trace_id: null,
    session_id: null,
  };
};

export const createEvent = (
  event: WithDateTimeInputs<
    EventRecordInsertType,
    | "start_time"
    | "end_time"
    | "completion_start_time"
    | "created_at"
    | "updated_at"
    | "event_ts"
  > & {
    metadata_values?: (string | null | undefined)[];
  },
): EventRecordInsertType => {
  const spanId = v4();

  // Extract metadata array overrides before spreading to prevent undefined from clobbering defaults
  const {
    metadata_values: metadataValuesAlias,
    metadata_names: metadataNamesOverride,
    start_time,
    end_time,
    completion_start_time,
    created_at,
    updated_at,
    event_ts,
    ...eventOverrides
  } = event;

  // Default metadata to populate arrays from
  const defaultMetadata: Record<string, string> = {
    source: "API",
    server: "Node",
  };

  // Extract metadata keys and values in sorted order for deterministic array population
  const sortedKeys = Object.keys(defaultMetadata).sort();
  const metadataNames = sortedKeys;
  const metadataValues = sortedKeys.map((key) => defaultMetadata[key]);

  return {
    // Identifiers
    project_id: v4(),
    trace_id: v4(),
    span_id: spanId,
    id: spanId,
    parent_span_id: null,

    // Core properties
    name: "test-event" + v4(),
    type: "GENERATION",
    environment: "default",
    version: null,
    release: null,

    tags: [],

    user_id: null,
    session_id: null,
    is_app_root: false,

    level: "DEFAULT",
    status_message: null,

    // Prompt
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,

    // Model
    model_id: null,
    provided_model_name: "gpt-3.5-turbo",
    model_parameters: "{}",

    // Usage & Cost
    provided_usage_details: { input: 1234, output: 5678, total: 6912 },
    usage_details: { input: 1234, output: 5678, total: 6912 },
    provided_cost_details: { input: 100, output: 200, total: 300 },
    cost_details: { input: 100, output: 200, total: 300 },

    // Tool calls
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],

    // I/O
    input: "Hello World",
    output: "Hello John",

    // Metadata
    metadata_names: metadataNamesOverride ?? metadataNames,
    metadata_values: metadataValuesAlias ?? metadataValues,

    // Experiment properties
    experiment_id: null,
    experiment_name: null,
    experiment_metadata_names: [],
    experiment_metadata_values: [],
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_version: null,
    experiment_item_expected_output: null,
    experiment_item_metadata_names: [],
    experiment_item_metadata_values: [],
    experiment_item_root_span_id: null,

    // Source metadata (Instrumentation)
    source: "API",
    service_name: null,
    service_version: null,
    scope_name: null,
    scope_version: null,
    telemetry_sdk_language: null,
    telemetry_sdk_name: null,
    telemetry_sdk_version: null,
    ingestion_api_key: "pk-lf-1234567890",
    ingestion_sdk_name: "langfuse-js",
    ingestion_sdk_version: "5.0.1",

    // Generic props
    blob_storage_file_path: "",
    event_bytes: 2,
    is_deleted: 0,

    // Timestamps (ClickHouse DateTime64 strings)
    start_time: toEventClickhouseDateTime(start_time),
    end_time: end_time === null ? null : toEventClickhouseDateTime(end_time),
    completion_start_time:
      completion_start_time == null
        ? null
        : toEventClickhouseDateTime(completion_start_time),
    created_at: toEventClickhouseDateTime(created_at),
    updated_at: toEventClickhouseDateTime(updated_at),
    event_ts: toEventClickhouseDateTime(event_ts),

    ...eventOverrides,
  };
};
