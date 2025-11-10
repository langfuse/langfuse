import { v4 } from "uuid";
import {
  TraceRecordInsertType,
  ObservationRecordInsertType,
  ScoreRecordInsertType,
  DatasetRunItemRecordInsertType,
  EventRecordInsertType,
} from "../repositories/definitions";

export const createTrace = (
  trace: Partial<TraceRecordInsertType>,
): TraceRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    timestamp: Date.now(),
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
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...trace,
  };
};

export const createDatasetRunItem = (
  datasetRunItem: Partial<DatasetRunItemRecordInsertType>,
): DatasetRunItemRecordInsertType => {
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
    dataset_run_created_at: Date.now(),
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    error: datasetRunItem.error ?? null,
    ...datasetRunItem,
  };
};

export const createObservation = (
  observation: Partial<ObservationRecordInsertType>,
): ObservationRecordInsertType => {
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
    created_at: Date.now(),
    updated_at: Date.now(),
    start_time: Date.now(),
    event_ts: Date.now(),
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
    end_time: Date.now(),
    completion_start_time: Date.now(),
    ...observation,
  };
};

export const createTraceScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    trace_id: v4(),
    observation_id: v4(),
    environment: "default",
    name: "test-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    session_id: null,
    dataset_run_id: null,
  };
};

export const createSessionScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    session_id: v4(),
    environment: "default",
    name: "test-session-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    observation_id: null,
    trace_id: null,
    dataset_run_id: null,
  };
};

export const createDatasetRunScore = (
  score: Partial<ScoreRecordInsertType>,
): ScoreRecordInsertType => {
  return {
    id: v4(),
    project_id: v4(),
    dataset_run_id: v4(),
    environment: "default",
    name: "test-run-score" + v4(),
    timestamp: Date.now(),
    value: 100.5,
    source: "API",
    comment: "comment",
    metadata: { "test-key": "test-value" },
    data_type: "NUMERIC" as const,
    created_at: Date.now(),
    updated_at: Date.now(),
    event_ts: Date.now(),
    is_deleted: 0,
    ...score,
    observation_id: null,
    trace_id: null,
    session_id: null,
  };
};

export const createEvent = (
  event: Partial<EventRecordInsertType>,
): EventRecordInsertType => {
  const spanId = v4();
  const now = Date.now() * 1000; // Convert to micro

  // Default metadata to populate arrays from
  const defaultMetadata: Record<string, string> = {
    source: "API",
    server: "Node",
  };

  // Merge default metadata with any provided metadata
  const finalMetadata: Record<string, string> = {
    ...defaultMetadata,
    ...event.metadata,
  };

  // Extract metadata keys and values in sorted order for deterministic array population
  const sortedKeys = Object.keys(finalMetadata).sort();
  const metadataNames = sortedKeys;
  const metadataValues = sortedKeys.map((key) => finalMetadata[key]);

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

    // I/O
    input: "Hello World",
    output: "Hello John",

    // Metadata - populate both JSON and array columns
    metadata: finalMetadata,
    metadata_names: metadataNames,
    metadata_raw_values: metadataValues,

    // Experiment properties
    experiment_id: null,
    experiment_name: null,
    experiment_metadata_names: [],
    experiment_metadata_values: [],
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
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

    // Generic props
    blob_storage_file_path: "",
    event_bytes: 2,
    is_deleted: 0,

    // Timestamps
    start_time: now,
    end_time: now,
    completion_start_time: null,
    created_at: now,
    updated_at: now,
    event_ts: now,

    ...event,
  };
};
