import z from "zod/v4";
import { DEFAULT_TRACE_ENVIRONMENT } from "../ingestion/types";

export const clickhouseStringDateSchema = z
  .string()
  // clickhouse stores UTC like '2024-05-23 18:33:41.602000'
  // we need to convert it to '2024-05-23T18:33:41.602000Z'
  .transform((str) => str.replace(" ", "T") + "Z")
  .pipe(z.string().datetime());

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
            code: z.ZodIssueCode.custom,
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

    // System fields
    created_at: traceRecord.created_at,
    updated_at: traceRecord.updated_at,
    event_ts: traceRecord.event_ts,
    is_deleted: traceRecord.is_deleted,

    // Staging-specific field
    s3_first_seen_timestamp: s3FirstSeenTimestamp,
  };
};

/**
 * Expects a single record from a `select * from traces` query. Must be a raw query to keep original
 * column names, not the Prisma mapped names.
 */
export const convertPostgresTraceToInsert = (
  trace: Record<string, any>,
): TraceRecordInsertType => {
  return {
    id: trace.id,
    timestamp: trace.timestamp?.getTime(),
    name: trace.name,
    user_id: trace.user_id,
    metadata:
      typeof trace.metadata === "string"
        ? { metadata: trace.metadata }
        : Array.isArray(trace.metadata)
          ? { metadata: trace.metadata }
          : trace.metadata,
    environment: trace.environment,
    release: trace.release,
    version: trace.version,
    project_id: trace.project_id,
    public: trace.public,
    bookmarked: trace.bookmarked,
    tags: trace.tags,
    input: trace.input ? JSON.stringify(trace.input) : null,
    output: trace.output ? JSON.stringify(trace.output) : null,
    session_id: trace.session_id,
    created_at: trace.created_at?.getTime(),
    updated_at: trace.updated_at?.getTime(),
    event_ts: trace.timestamp?.getTime(),
    is_deleted: 0,
  };
};

export const convertPostgresDatasetRunItemToInsert = (
  datasetRunItem: Record<string, any>,
): DatasetRunItemRecordInsertType => {
  return {
    id: datasetRunItem.id,
    project_id: datasetRunItem.project_id,
    dataset_run_id: datasetRunItem.dataset_run_id,
    dataset_item_id: datasetRunItem.dataset_item_id,
    dataset_id: datasetRunItem.dataset_id,
    trace_id: datasetRunItem.trace_id,
    observation_id: datasetRunItem.observation_id,
    error: datasetRunItem.error,
    created_at: datasetRunItem.created_at?.getTime(),
    updated_at: datasetRunItem.updated_at?.getTime(),
    // denormalized run data
    dataset_run_name: datasetRunItem.dataset_run_name,
    dataset_run_description: datasetRunItem.dataset_run_description,
    dataset_run_metadata:
      typeof datasetRunItem.dataset_run_metadata === "string" ||
      typeof datasetRunItem.dataset_run_metadata === "number" ||
      typeof datasetRunItem.dataset_run_metadata === "boolean"
        ? { metadata: datasetRunItem.dataset_run_metadata }
        : Array.isArray(datasetRunItem.dataset_run_metadata)
          ? { metadata: datasetRunItem.dataset_run_metadata }
          : (datasetRunItem.dataset_run_metadata ?? {}),
    dataset_run_created_at: datasetRunItem.dataset_run_created_at?.getTime(),
    // denormalized item data
    dataset_item_input: JSON.stringify(datasetRunItem.dataset_item_input),
    dataset_item_expected_output: JSON.stringify(
      datasetRunItem.dataset_item_expected_output,
    ),
    dataset_item_metadata:
      typeof datasetRunItem.dataset_item_metadata === "string" ||
      typeof datasetRunItem.dataset_item_metadata === "number" ||
      typeof datasetRunItem.dataset_item_metadata === "boolean"
        ? { metadata: datasetRunItem.dataset_item_metadata }
        : Array.isArray(datasetRunItem.dataset_item_metadata)
          ? { metadata: datasetRunItem.dataset_item_metadata }
          : (datasetRunItem.dataset_item_metadata ?? {}),
    event_ts: datasetRunItem.created_at?.getTime(),
    is_deleted: 0,
  };
};

/**
 * Expects a single record from a
 * `select o.*,
 *         o."modelParameters" as model_parameters,
 *         p.name as prompt_name,
 *         p.version as prompt_version
 *  from observations o
 *  LEFT JOIN prompts p ON p.id = o.prompt_id`
 * query. Must be a raw query to keep original
 * column names, not the Prisma mapped names.
 */
export const convertPostgresObservationToInsert = (
  observation: Record<string, any>,
): ObservationRecordInsertType => {
  return {
    id: observation.id,
    trace_id: observation.trace_id,
    project_id: observation.project_id,
    type: observation.type,
    parent_observation_id: observation.parent_observation_id,
    environment: observation.environment,
    start_time: observation.start_time?.getTime(),
    end_time: observation.end_time?.getTime(),
    name: observation.name,
    metadata:
      typeof observation.metadata === "string"
        ? { metadata: observation.metadata }
        : Array.isArray(observation.metadata)
          ? { metadata: observation.metadata }
          : observation.metadata,
    level: observation.level,
    status_message: observation.status_message,
    version: observation.version,
    input: observation.input ? JSON.stringify(observation.input) : null,
    output: observation.output ? JSON.stringify(observation.output) : null,
    provided_model_name: observation.model,
    internal_model_id: observation.internal_model_id,
    model_parameters: observation.model_parameters
      ? JSON.stringify(observation.model_parameters)
      : null,
    provided_usage_details: {},
    usage_details: {
      input: observation.prompt_tokens >= 0 ? observation.prompt_tokens : null,
      output:
        observation.completion_tokens >= 0
          ? observation.completion_tokens
          : null,
      total: observation.total_tokens >= 0 ? observation.total_tokens : null,
    },
    provided_cost_details: {
      input: observation.input_cost?.toNumber() ?? null,
      output: observation.output_cost?.toNumber() ?? null,
      total: observation.total_cost?.toNumber() ?? null,
    },
    cost_details: {
      input: observation.calculated_input_cost?.toNumber() ?? null,
      output: observation.calculated_output_cost?.toNumber() ?? null,
      total: observation.calculated_total_cost?.toNumber() ?? null,
    },
    total_cost: observation.calculated_total_cost?.toNumber() ?? null,
    completion_start_time: observation.completion_start_time?.getTime(),
    prompt_id: observation.prompt_id,
    prompt_name: observation.prompt_name,
    prompt_version: observation.prompt_version,
    // Tool fields - Postgres observations don't have persisted tools
    tool_definitions: undefined,
    tool_calls: undefined,
    tool_call_names: undefined,
    created_at: observation.created_at?.getTime(),
    updated_at: observation.updated_at?.getTime(),
    event_ts: observation.start_time?.getTime(),
    is_deleted: 0,
  };
};

/**
 * Expects a single record from a `select * from scores` query. Must be a raw query to keep original
 * column names, not the Prisma mapped names.
 */
export const convertPostgresScoreToInsert = (
  score: Record<string, any>,
): ScoreRecordInsertType => {
  return {
    id: score.id,
    timestamp: score.timestamp?.getTime(),
    project_id: score.project_id,
    trace_id: score.trace_id,
    session_id: null,
    dataset_run_id: null,
    observation_id: score.observation_id,
    environment: score.environment,
    name: score.name,
    value: score.value,
    source: score.source,
    comment: score.comment,
    metadata: score.metadata ?? {},
    author_user_id: score.author_user_id,
    config_id: score.config_id,
    data_type: score.data_type,
    string_value: score.string_value,
    long_string_value: "",
    queue_id: score.queue_id,
    execution_trace_id: null, // Postgres scores do not have eval execution traces
    created_at: score.created_at?.getTime(),
    updated_at: score.updated_at?.getTime(),
    event_ts: score.timestamp?.getTime(),
    is_deleted: 0,
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

  // User updatable flags
  tags: z.array(z.string()).default([]),
  bookmarked: z.boolean().optional(),
  public: z.boolean().optional(),

  level: z.string(),
  status_message: z.string().nullish(),

  // Prompt
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.string().nullish(),

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
  metadata: z.record(z.string(), z.string()),
  metadata_names: z.array(z.string()).default([]),

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
  metadata_values: z.array(z.string()).default([]),
  metadata_hashes: z.array(z.number().int()).default([]),
  metadata_long_values: z.record(z.number().int(), z.string()).default({}),
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
  metadata_raw_values: z.array(z.string().nullish()).default([]),
  start_time: z.number(),
  end_time: z.number().nullish(),
  completion_start_time: z.number().nullish(),
  created_at: z.number(),
  updated_at: z.number(),
  event_ts: z.number(),
});
export type EventRecordInsertType = z.infer<typeof eventRecordInsertSchema>;
