import z from "zod";
import type { IngestionAttribution } from "../ingestion/ingestionAttribution";
import { DEFAULT_TRACE_ENVIRONMENT } from "../ingestion/types";

export const clickhouseStringDateSchema = z
  .string()
  // clickhouse stores UTC like '2024-05-23 18:33:41.602000'
  // we need to convert it to '2024-05-23T18:33:41.602000Z'
  .transform((str) => str.replace(" ", "T") + "Z")
  .pipe(z.iso.datetime());

//https://clickhouse.com/docs/en/integrations/javascript#integral-types-int64-int128-int256-uint64-uint128-uint256
// clickhouse returns int64 as string
export const UsageCostSchema = z
  .record(z.string(), z.coerce.string().nullable())
  .transform((val, ctx) => {
    const result: Record<string, number> = {};
    for (const key in val) {
      if (val[key] !== null && val[key] !== undefined) {
        const parsed = Number(val[key]);
        if (isNaN(parsed)) {
          ctx.addIssue({
            code: "custom",
            message: `Key ${key} is not a number`,
          });
        } else {
          result[key] = parsed;
        }
      }
    }
    return result;
  });
export type UsageCostType = z.infer<typeof UsageCostSchema>;

export const observationRecordBaseSchema = z.object({
  id: z.string(),
  trace_id: z.string().nullish(),
  project_id: z.string(),
  type: z.string(),
  parent_observation_id: z.string().nullish(),
  environment: z.string().default("default"),
  name: z.string().nullish(),
  metadata: z.record(z.string(), z.string()),
  level: z.string().nullish(),
  status_message: z.string().nullish(),
  version: z.string().nullish(),
  input: z.string().nullish(),
  output: z.string().nullish(),
  provided_model_name: z.string().nullish(),
  internal_model_id: z.string().nullish(),
  model_parameters: z.string().nullish(),
  total_cost: z.number().nullish(),
  usage_pricing_tier_id: z.string().nullish(),
  usage_pricing_tier_name: z.string().nullish(),
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.number().nullish(),
  tool_definitions: z.record(z.string(), z.string()).optional(),
  tool_calls: z.array(z.string()).optional(),
  tool_call_names: z.array(z.string()).optional(),
  is_deleted: z.number(),
});

export const observationRecordReadSchema = observationRecordBaseSchema.extend({
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  start_time: clickhouseStringDateSchema,
  end_time: clickhouseStringDateSchema.nullish(),
  completion_start_time: clickhouseStringDateSchema.nullish(),
  event_ts: clickhouseStringDateSchema,
  provided_usage_details: UsageCostSchema,
  provided_cost_details: UsageCostSchema,
  usage_details: UsageCostSchema,
  cost_details: UsageCostSchema,
});
export type ObservationRecordReadType = z.infer<
  typeof observationRecordReadSchema
>;

export const observationRecordInsertSchema = observationRecordBaseSchema.extend(
  {
    created_at: z.number(),
    updated_at: z.number(),
    start_time: z.number(),
    end_time: z.number().nullish(),
    completion_start_time: z.number().nullish(),
    event_ts: z.number(),
    provided_usage_details: UsageCostSchema,
    provided_cost_details: UsageCostSchema,
    usage_details: UsageCostSchema,
    cost_details: UsageCostSchema,
  },
);
export type ObservationRecordInsertType = z.infer<
  typeof observationRecordInsertSchema
>;

export const observationBatchStagingRecordInsertSchema =
  observationRecordInsertSchema.extend({
    ingestion_api_key: z.string(),
    ingestion_sdk_name: z.string(),
    ingestion_sdk_version: z.string(),
    s3_first_seen_timestamp: z.number(),
  });
export type ObservationBatchStagingRecordInsertType = z.infer<
  typeof observationBatchStagingRecordInsertSchema
>;

// Events-specific observation schema (includes user_id and session_id)
// These fields are only available in the events table, not in historical observations
export const eventsObservationRecordBaseSchema =
  observationRecordBaseSchema.extend({
    user_id: z.string().nullish(),
    session_id: z.string().nullish(),
  });

export const eventsObservationRecordReadSchema =
  observationRecordReadSchema.extend({
    user_id: z.string().nullish(),
    session_id: z.string().nullish(),
    trace_name: z.string().nullish(),
    release: z.string().nullish(),
    tags: z.array(z.string()).optional(),
    bookmarked: z.boolean().optional(),
    public: z.boolean().optional(),
  });
export type EventsObservationRecordReadType = z.infer<
  typeof eventsObservationRecordReadSchema
>;

export const traceRecordBaseSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  user_id: z.string().nullish(),
  metadata: z.record(z.string(), z.string()),
  release: z.string().nullish(),
  version: z.string().nullish(),
  project_id: z.string(),
  environment: z.string().default("default"),
  public: z.boolean(),
  bookmarked: z.boolean(),
  tags: z.array(z.string()),
  input: z.string().nullish(),
  output: z.string().nullish(),
  session_id: z.string().nullish(),
  is_deleted: z.number(),
});

export const traceRecordExtraFields = z.object({
  observations: z.array(z.string()).optional(),
  scores: z.array(z.string()).optional(),
  totalCost: z.number().optional(),
  latency: z.number().optional(),
  htmlPath: z.string().nullable(),
});

export type TraceRecordExtraFieldsType = z.infer<typeof traceRecordExtraFields>;

export const traceRecordReadSchema = traceRecordBaseSchema.extend({
  timestamp: clickhouseStringDateSchema,
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  event_ts: clickhouseStringDateSchema,
});
export type TraceRecordReadType = z.infer<typeof traceRecordReadSchema>;

export const traceRecordInsertSchema = traceRecordBaseSchema.extend({
  timestamp: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
  event_ts: z.number(),
});
export type TraceRecordInsertType = z.infer<typeof traceRecordInsertSchema>;

export const traceNullRecordInsertSchema = z.object({
  // Identifiers
  project_id: z.string(),
  id: z.string(),
  start_time: z.number(),
  end_time: z.number().nullish(),
  name: z.string().nullish(),

  // Metadata properties
  metadata: z.record(z.string(), z.string()),
  user_id: z.string().nullish(),
  session_id: z.string().nullish(),
  environment: z.string(),
  tags: z.array(z.string()),
  version: z.string().nullish(),
  release: z.string().nullish(),

  // UI properties - nullable to prevent absent values being interpreted as overwrites
  bookmarked: z.boolean().nullish(),
  public: z.boolean().nullish(),

  // Aggregations
  observation_ids: z.array(z.string()),
  score_ids: z.array(z.string()),
  cost_details: z.record(z.string(), z.number()),
  usage_details: z.record(z.string(), z.number()),

  // Input/Output
  input: z.string(),
  output: z.string(),

  created_at: z.number(),
  updated_at: z.number(),
  event_ts: z.number(),
});
export type TraceNullRecordInsertType = z.infer<
  typeof traceNullRecordInsertSchema
>;

export const scoreRecordBaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  trace_id: z.string().nullish(),
  session_id: z.string().nullish(),
  observation_id: z.string().nullish(),
  dataset_run_id: z.string().nullish(),
  environment: z.string().default("default"),
  name: z.string(),
  value: z.number(),
  source: z.string(),
  comment: z.string().nullish(),
  metadata: z.record(z.string(), z.string()),
  author_user_id: z.string().nullish(),
  config_id: z.string().nullish(),
  data_type: z.string(),
  string_value: z.string().nullish(),
  long_string_value: z.string(),
  queue_id: z.string().nullish(),
  execution_trace_id: z.string().nullish(),
  ingestion_api_key: z.string(),
  ingestion_sdk_name: z.string(),
  ingestion_sdk_version: z.string(),
  is_deleted: z.number(),
});

export const scoreRecordReadSchema = scoreRecordBaseSchema.extend({
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  timestamp: clickhouseStringDateSchema,
  event_ts: clickhouseStringDateSchema,
});
export type ScoreRecordReadType = z.infer<typeof scoreRecordReadSchema>;

export const scoreRecordInsertSchema = scoreRecordBaseSchema.extend({
  created_at: z.number(),
  updated_at: z.number(),
  timestamp: z.number(),
  event_ts: z.number(),
});
export type ScoreRecordInsertType = z.infer<typeof scoreRecordInsertSchema>;

const datasetRunItemRecordBaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  trace_id: z.string(),
  observation_id: z.string().nullish(),
  dataset_id: z.string(),
  dataset_run_id: z.string(),
  dataset_item_id: z.string(),
  dataset_run_name: z.string(),
  dataset_run_description: z.string().nullish(),
  dataset_run_metadata: z.record(z.string(), z.string()),
  dataset_item_input: z.string(),
  dataset_item_expected_output: z.string(),
  dataset_item_metadata: z.record(z.string(), z.string()),
  is_deleted: z.number(),
  error: z.string().nullish(),
});

const _datasetRunItemRecordReadSchema = datasetRunItemRecordBaseSchema.extend({
  dataset_run_created_at: clickhouseStringDateSchema,
  dataset_item_version: clickhouseStringDateSchema.nullish(),
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  event_ts: clickhouseStringDateSchema,
});
export type DatasetRunItemRecordReadType = z.infer<
  typeof _datasetRunItemRecordReadSchema
>;
// Conditional type for dataset run item records with optional IO
export type DatasetRunItemRecord<WithIO extends boolean = true> =
  WithIO extends true
    ? DatasetRunItemRecordReadType
    : Omit<
        DatasetRunItemRecordReadType,
        | "dataset_run_metadata"
        | "dataset_item_input"
        | "dataset_item_expected_output"
        | "dataset_item_metadata"
      >;

export const datasetRunItemRecordInsertSchema =
  datasetRunItemRecordBaseSchema.extend({
    created_at: z.number(),
    updated_at: z.number(),
    event_ts: z.number(),
    dataset_run_created_at: z.number(),
    dataset_item_version: z.number().nullish(),
  });
export type DatasetRunItemRecordInsertType = z.infer<
  typeof datasetRunItemRecordInsertSchema
>;

export const blobStorageFileLogRecordBaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  entity_type: z.string(),
  entity_id: z.string(),
  // event_id is nullable to be compatible with legacy queue events.
  // It still allows us to delete things by prefix, but requires an additional list call.
  event_id: z.string().nullable(),
  bucket_name: z.string(),
  bucket_path: z.string(),
  is_deleted: z.number(),
});
export const blobStorageFileRefRecordReadSchema =
  blobStorageFileLogRecordBaseSchema.extend({
    created_at: clickhouseStringDateSchema,
    updated_at: clickhouseStringDateSchema,
    event_ts: clickhouseStringDateSchema,
  });
export type BlobStorageFileRefRecordReadType = z.infer<
  typeof blobStorageFileRefRecordReadSchema
>;
export const blobStorageFileLogRecordInsertSchema =
  blobStorageFileLogRecordBaseSchema.extend({
    created_at: z.number(),
    updated_at: z.number(),
    event_ts: z.number(),
  });
export type BlobStorageFileLogInsertType = z.infer<
  typeof blobStorageFileLogRecordInsertSchema
>;

export const convertTraceReadToInsert = (
  record: TraceRecordReadType,
): TraceRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.updated_at).getTime(),
    timestamp: new Date(record.timestamp).getTime(),
    event_ts: new Date(record.event_ts).getTime(),
  };
};

export const convertObservationReadToInsert = (
  record: ObservationRecordReadType,
): ObservationRecordInsertType => {
  const convertDate = (date: string) => new Date(date).getTime();

  return {
    ...record,
    created_at: convertDate(record.created_at),
    updated_at: convertDate(record.updated_at),
    start_time: convertDate(record.start_time),
    end_time: record.end_time ? convertDate(record.end_time) : undefined,
    completion_start_time: record.completion_start_time
      ? convertDate(record.completion_start_time)
      : undefined,
    event_ts: convertDate(record.event_ts),
    provided_usage_details: record.provided_usage_details,
    provided_cost_details: record.provided_cost_details,
    usage_details: record.usage_details,
    cost_details: record.cost_details,
  };
};

export const convertScoreReadToInsert = (
  record: ScoreRecordReadType,
): ScoreRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.updated_at).getTime(),
    timestamp: new Date(record.timestamp).getTime(),
    event_ts: new Date(record.event_ts).getTime(),
  };
};

/**
 * Converts a trace record to a staging observation record.
 * The trace is treated as a synthetic "SPAN" where span_id = trace_id.
 * This allows traces to flow through the same batch propagation pipeline as observations.
 */
export const convertTraceToStagingObservation = (
  traceRecord: TraceRecordInsertType,
  s3FirstSeenTimestamp: number,
  attribution: IngestionAttribution,
): ObservationBatchStagingRecordInsertType => {
  return {
    // Identity - trace acts as its own span. Modify traceId to avoid cases where users set spanId = traceId.
    id: `t-${traceRecord.id}`,
    trace_id: traceRecord.id,
    project_id: traceRecord.project_id,

    // Type: pretend trace is a SPAN
    type: "SPAN",

    // No parent since traces are root-level
    parent_observation_id: undefined,

    // Core fields from trace
    name: traceRecord.name,
    environment: traceRecord.environment,
    version: traceRecord.version,
    metadata: traceRecord.metadata,

    // Timing: trace.timestamp -> start_time
    start_time: traceRecord.timestamp,
    end_time: undefined,
    completion_start_time: undefined,

    // IO fields
    input: traceRecord.input,
    output: traceRecord.output,

    // Default values for observation-specific fields
    level: "DEFAULT",
    status_message: undefined,
    provided_model_name: undefined,
    internal_model_id: undefined,
    model_parameters: undefined,
    provided_usage_details: {},
    usage_details: {},
    provided_cost_details: {},
    cost_details: {},
    total_cost: undefined,
    prompt_id: undefined,
    prompt_name: undefined,
    prompt_version: undefined,

    // Tool fields - traces don't have tools
    tool_definitions: undefined,
    tool_calls: undefined,
    tool_call_names: undefined,

    // Ingestion attribution
    ingestion_api_key: attribution.ingestionApiKey,
    ingestion_sdk_name: attribution.ingestionSdkName,
    ingestion_sdk_version: attribution.ingestionSdkVersion,

    // System fields
    created_at: traceRecord.created_at,
    updated_at: traceRecord.updated_at,
    event_ts: traceRecord.event_ts,
    is_deleted: traceRecord.is_deleted,

    // Staging-specific field
    s3_first_seen_timestamp: s3FirstSeenTimestamp,
  };
};

export const eventRecordBaseSchema = z.object({
  // Identifiers
  org_id: z.string().nullish(),
  project_id: z.string(),
  trace_id: z.string(),
  span_id: z.string(),
  // We mainly use the id for compatibility with old events that always had a `id` column.
  id: z.string(), // same as span_id. Needs to be set manually.
  parent_span_id: z.string().nullish(),

  // Core properties
  name: z.string(),
  type: z.string(),
  environment: z.string().default(DEFAULT_TRACE_ENVIRONMENT),
  version: z.string().nullish(),
  release: z.string().nullish(),

  trace_name: z.string().nullish(),
  user_id: z.string().nullish(),
  session_id: z.string().nullish(),
  is_app_root: z.boolean().default(false),

  // User updatable flags
  tags: z.array(z.string()).default([]),
  bookmarked: z.boolean().optional(),
  public: z.boolean().optional(),

  level: z.string(),
  status_message: z.string().nullish(),

  // Prompt
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.number().nullish(),

  // Model
  model_id: z.string().nullish(),
  provided_model_name: z.string().nullish(),
  model_parameters: z.string().nullish(),

  // Usage & Cost
  provided_usage_details: UsageCostSchema,
  usage_details: UsageCostSchema,
  provided_cost_details: UsageCostSchema,
  cost_details: UsageCostSchema,

  usage_pricing_tier_id: z.string().nullish(),
  usage_pricing_tier_name: z.string().nullish(),

  // Tool calls
  tool_definitions: z.record(z.string(), z.string()).default({}),
  tool_calls: z.array(z.string()).default([]),
  tool_call_names: z.array(z.string()).default([]),

  // I/O
  input: z.string().nullish(),
  output: z.string().nullish(),

  // Metadata
  metadata_names: z.array(z.string()).default([]),
  metadata_values: z.array(z.string()).default([]),

  // Experiment properties
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_metadata_names: z.array(z.string()).default([]),
  experiment_metadata_values: z.array(z.string().nullish()).default([]),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_version: clickhouseStringDateSchema.nullish(),
  experiment_item_expected_output: z.string().nullish(),
  experiment_item_metadata_names: z.array(z.string()).default([]),
  experiment_item_metadata_values: z.array(z.string().nullish()).default([]),
  experiment_item_root_span_id: z.string().nullish(),

  // Source metadata (Instrumentation)
  source: z.string(),
  ingestion_api_key: z.string(),
  ingestion_sdk_name: z.string(),
  ingestion_sdk_version: z.string(),
  service_name: z.string().nullish(),
  service_version: z.string().nullish(),
  scope_name: z.string().nullish(),
  scope_version: z.string().nullish(),
  telemetry_sdk_language: z.string().nullish(),
  telemetry_sdk_name: z.string().nullish(),
  telemetry_sdk_version: z.string().nullish(),

  // Generic props
  blob_storage_file_path: z.string(),
  event_bytes: z.number(),
  is_deleted: z.number(),
});

// Base type for event records - used by converters that work with both Insert and Read types
export type EventRecordBaseType = z.infer<typeof eventRecordBaseSchema>;

export const eventRecordReadSchema = eventRecordBaseSchema.extend({
  total_cost: z.number().nullish(),

  start_time: clickhouseStringDateSchema,
  end_time: clickhouseStringDateSchema.nullish(),
  completion_start_time: clickhouseStringDateSchema.nullish(),
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  event_ts: clickhouseStringDateSchema,
});
export type EventRecordReadType = z.infer<typeof eventRecordReadSchema>;

export const eventRecordInsertSchema = eventRecordBaseSchema.extend({
  start_time: z.number(),
  end_time: z.number().nullish(),
  completion_start_time: z.number().nullish(),
  created_at: z.number(),
  updated_at: z.number(),
  event_ts: z.number(),
});
export type EventRecordInsertType = z.infer<typeof eventRecordInsertSchema>;
