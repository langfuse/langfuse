import z from "zod/v4";

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
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.number().nullish(),
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

export const traceMtRecordInsertSchema = z.object({
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
export type TraceMtRecordInsertType = z.infer<typeof traceMtRecordInsertSchema>;

export const scoreRecordBaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  trace_id: z.string().nullish(),
  session_id: z.string().nullish(),
  observation_id: z.string().nullish(),
  dataset_run_id: z.string().nullish(),
  environment: z.string().default("default"),
  name: z.string(),
  value: z.number().nullish(),
  source: z.string(),
  comment: z.string().nullish(),
  metadata: z.record(z.string(), z.string()),
  author_user_id: z.string().nullish(),
  config_id: z.string().nullish(),
  data_type: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"]).nullish(),
  string_value: z.string().nullish(),
  queue_id: z.string().nullish(),
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
    queue_id: score.queue_id,
    created_at: score.created_at?.getTime(),
    updated_at: score.updated_at?.getTime(),
    event_ts: score.timestamp?.getTime(),
    is_deleted: 0,
  };
};

export const convertTraceToTraceMt = (
  traceRecord: TraceRecordInsertType,
): TraceMtRecordInsertType => {
  return {
    // Identifiers
    project_id: traceRecord.project_id,
    id: traceRecord.id,
    start_time: traceRecord.timestamp,
    end_time: null, // traces don't have end_time, will be null
    name: traceRecord.name || null,

    // Metadata properties
    metadata: traceRecord.metadata,
    user_id: traceRecord.user_id || null,
    session_id: traceRecord.session_id || null,
    environment: traceRecord.environment,
    tags: traceRecord.tags,
    version: traceRecord.version || null,
    release: traceRecord.release || null,

    // UI properties - nullable to prevent absent values being interpreted as overwrites
    bookmarked: traceRecord.bookmarked ?? null,
    public: traceRecord.public ?? null,

    // Aggregations - empty for now, will be populated by aggregation processes
    observation_ids: [],
    score_ids: [],
    cost_details: {},
    usage_details: {},

    // Input/Output
    input: traceRecord.input || "",
    output: traceRecord.output || "",

    created_at: traceRecord.created_at,
    updated_at: traceRecord.updated_at,
    event_ts: traceRecord.event_ts,
  };
};

export const convertObservationToTraceMt = (
  observationRecord: ObservationRecordInsertType,
): TraceMtRecordInsertType => {
  return {
    // Identifiers
    project_id: observationRecord.project_id,
    // Use trace_id as the id in traces_mt. Always set given the conditions around calling the function
    id: observationRecord.trace_id || "",
    start_time: observationRecord.start_time,
    end_time: observationRecord.end_time || null,
    name: null,

    // Metadata properties
    metadata: {},
    user_id: null,
    session_id: null,
    environment: observationRecord.environment,
    tags: [],
    version: null,
    release: null,

    // UI properties - nullable to prevent absent values being interpreted as overwrites
    bookmarked: null,
    public: null,

    // Aggregations - include this observation ID
    observation_ids: [observationRecord.id],
    score_ids: [],
    // We can fill the cost details here, but we shouldn't trust them.
    // Only used for verification to estimate how big the double-counting is.
    // Actually, we don't as this will make backfills challenging.
    cost_details: {}, // observationRecord.cost_details || {},
    usage_details: {}, // observationRecord.usage_details || {},

    // Input/Output
    input: "",
    output: "",

    created_at: observationRecord.created_at,
    updated_at: observationRecord.updated_at,
    event_ts: observationRecord.event_ts,
  };
};

export const convertScoreToTraceMt = (
  scoreRecord: ScoreRecordInsertType,
): TraceMtRecordInsertType => {
  return {
    // Identifiers
    project_id: scoreRecord.project_id,
    // Use trace_id as the id in traces_mt. Always set given the conditions around calling the function
    id: scoreRecord.trace_id || "",
    start_time: scoreRecord.timestamp,
    end_time: null, // scores don't have end_time
    name: null,

    // Metadata properties
    metadata: {},
    user_id: null,
    session_id: null,
    environment: scoreRecord.environment,
    tags: [], // scores don't have tags
    version: null, // scores don't have version
    release: null, // scores don't have release

    // UI properties - nullable to prevent absent values being interpreted as overwrites
    bookmarked: null,
    public: null,

    // Aggregations - include this score ID
    observation_ids: [],
    score_ids: [scoreRecord.id],
    cost_details: {},
    usage_details: {},

    // Input/Output
    input: "", // scores don't have input
    output: "", // scores don't have output

    created_at: scoreRecord.created_at,
    updated_at: scoreRecord.updated_at,
    event_ts: scoreRecord.event_ts,
  };
};
