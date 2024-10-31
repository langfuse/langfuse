import z from "zod";

export const clickhouseStringDateSchema = z
  .string()
  // clickhouse stores UTC like '2024-05-23 18:33:41.602000'
  // we need to convert it to '2024-05-23T18:33:41.602000Z'
  .transform((str) => str.replace(" ", "T") + "Z")
  .pipe(z.string().datetime());

export const UsageCostSchema = z.record(z.string(), z.coerce.number());
export type UsageCostType = z.infer<typeof UsageCostSchema>;

export const observationRecordBaseSchema = z.object({
  id: z.string(),
  trace_id: z.string().nullish(),
  project_id: z.string(),
  type: z.string(),
  parent_observation_id: z.string().nullish(),
  name: z.string().nullish(),
  metadata: z.record(z.string()),
  level: z.string().nullish(),
  status_message: z.string().nullish(),
  version: z.string().nullish(),
  input: z.string().nullish(),
  output: z.string().nullish(),
  provided_model_name: z.string().nullish(),
  internal_model_id: z.string().nullish(),
  model_parameters: z.string().nullish(),
  provided_usage_details: UsageCostSchema,
  provided_cost_details: UsageCostSchema,
  usage_details: UsageCostSchema,
  cost_details: UsageCostSchema,
  total_cost: z.number().nullish(),
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.number().nullish(),
  is_deleted: z.number(),
});
export type ObservationRecordBaseType = z.infer<
  typeof observationRecordBaseSchema
>;

export const observationRecordReadSchema = observationRecordBaseSchema.extend({
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  start_time: clickhouseStringDateSchema,
  end_time: clickhouseStringDateSchema.nullish(),
  completion_start_time: clickhouseStringDateSchema.nullish(),
  event_ts: clickhouseStringDateSchema,
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
  },
);
export type ObservationRecordInsertType = z.infer<
  typeof observationRecordInsertSchema
>;

export const traceRecordBaseSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  user_id: z.string().nullish(),
  metadata: z.record(z.string()),
  release: z.string().nullish(),
  version: z.string().nullish(),
  project_id: z.string(),
  public: z.boolean(),
  bookmarked: z.boolean(),
  tags: z.array(z.string()),
  input: z.string().nullish(),
  output: z.string().nullish(),
  session_id: z.string().nullish(),
  is_deleted: z.number(),
});
export type TraceRecordBaseType = z.infer<typeof traceRecordBaseSchema>;

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

export const scoreRecordBaseSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  trace_id: z.string(),
  observation_id: z.string().nullish(),
  name: z.string().nullish(),
  value: z.union([z.number(), z.string()]).nullish(),
  source: z.string(),
  comment: z.string().nullish(),
  author_user_id: z.string().nullish(),
  config_id: z.string().nullish(),
  data_type: z.enum(["NUMERIC", "CATEGORICAL", "BOOLEAN"]).nullish(),
  string_value: z.string().nullish(),
  is_deleted: z.number(),
});
export type ScoreRecordBaseType = z.infer<typeof scoreRecordBaseSchema>;

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

export const convertTraceReadToInsert = (
  record: TraceRecordReadType,
): TraceRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.created_at).getTime(),
    timestamp: new Date(record.timestamp).getTime(),
    event_ts: new Date(record.event_ts).getTime(),
  };
};

export const convertObservationReadToInsert = (
  record: ObservationRecordReadType,
): ObservationRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.created_at).getTime(),
    start_time: new Date(record.start_time).getTime(),
    end_time: record.end_time ? new Date(record.end_time).getTime() : undefined,
    completion_start_time: record.completion_start_time
      ? new Date(record.completion_start_time).getTime()
      : undefined,
    event_ts: new Date(record.event_ts).getTime(),
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
    timestamp:
      trace.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    name: trace.name,
    user_id: trace.user_id,
    metadata:
      typeof trace.metadata === "string"
        ? { metadata: trace.metadata }
        : Array.isArray(trace.metadata)
          ? { metadata: trace.metadata }
          : trace.metadata,
    release: trace.release,
    version: trace.version,
    project_id: trace.project_id,
    public: trace.public,
    bookmarked: trace.bookmarked,
    tags: trace.tags,
    input: trace.input,
    output: trace.output,
    session_id: trace.session_id,
    created_at:
      trace.created_at?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    updated_at:
      trace.updated_at?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    event_ts:
      trace.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    is_deleted: 0,
  };
};

/**
 * Expects a single record from a
 * `select o.id, o.trace_id, o.project_id, o.type, o.parent_observation_id, o.start_time, o.end_time, o.name, o.metadata,
 *         o.level, o.status_message, o.version, o.input, o.output, o.unit, o.model, o.internal_model_id, o."modelParameters" as model_parameters,
 *         o.prompt_tokens, o.completion_tokens, o.total_tokens, o.completion_start_time, o.prompt_id, p.name as prompt_name,
 *         p.version as prompt_version, o.input_cost, o.output_cost, o.total_cost, o.calculated_input_cost, o.calculated_output_cost,
 *         o.calculated_total_cost, o.created_at, o.updated_at
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
    start_time:
      observation.start_time?.toISOString().replace("T", " ").slice(0, -1) ??
      null,
    end_time:
      observation.end_time?.toISOString().replace("T", " ").slice(0, -1) ??
      null,
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
    input: observation.input,
    output: observation.output,
    provided_model_name: observation.model,
    internal_model_id: observation.internal_model_id,
    model_parameters: observation.model_parameters,
    provided_usage_details: {},
    usage_details: {
      input: observation.prompt_tokens,
      output: observation.completion_tokens,
      total: observation.total_tokens,
    },
    provided_cost_details: {
      input: observation.input_cost,
      output: observation.output_cost,
      total: observation.total_cost,
    },
    cost_details: {
      input: observation.calculated_input_cost,
      output: observation.calculated_output_cost,
      total: observation.calculated_total_cost,
    },
    total_cost: observation.calculated_total_cost,
    completion_start_time:
      observation.completion_start_time
        ?.toISOString()
        .replace("T", " ")
        .slice(0, -1) ?? null,
    prompt_id: observation.prompt_id,
    prompt_name: observation.prompt_name,
    prompt_version: observation.prompt_version,
    created_at:
      observation.created_at?.toISOString().replace("T", " ").slice(0, -1) ??
      null,
    updated_at:
      observation.updated_at?.toISOString().replace("T", " ").slice(0, -1) ??
      null,
    event_ts:
      observation.start_time?.toISOString().replace("T", " ").slice(0, -1) ??
      null,
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
    timestamp:
      score.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    project_id: score.project_id,
    trace_id: score.trace_id,
    observation_id: score.observation_id,
    name: score.name,
    value: score.value,
    source: score.source,
    comment: score.comment,
    author_user_id: score.author_user_id,
    config_id: score.config_id,
    data_type: score.data_type,
    string_value: score.string_value,
    created_at:
      score.created_at?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    updated_at:
      score.updated_at?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    event_ts:
      score.timestamp?.toISOString().replace("T", " ").slice(0, -1) ?? null,
    is_deleted: 0,
  };
};
