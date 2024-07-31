import z from "zod";

export const clickhouseStringDateSchema = z
  .string()
  // clickhouse stores UTC like '2024-05-23 18:33:41.602000'
  // we need to convert it to '2024-05-23T18:33:41.602000Z'
  .transform((str) => str.replace(" ", "T") + "Z")
  .pipe(z.string().datetime());

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
  unit: z.string().nullish(),
  input_usage_units: z.number().nullish(),
  output_usage_units: z.number().nullish(),
  total_usage_units: z.number().nullish(),
  input_cost: z.number().nullish(),
  output_cost: z.number().nullish(),
  total_cost: z.number().nullish(),
  provided_input_usage_units: z.number().nullish(),
  provided_output_usage_units: z.number().nullish(),
  provided_total_usage_units: z.number().nullish(),
  provided_input_cost: z.number().nullish(),
  provided_output_cost: z.number().nullish(),
  provided_total_cost: z.number().nullish(),
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  prompt_version: z.number().nullish(),
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
  }
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
});
export type TraceRecordBaseType = z.infer<typeof traceRecordBaseSchema>;

export const traceRecordReadSchema = traceRecordBaseSchema.extend({
  timestamp: clickhouseStringDateSchema,
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
});
export type TraceRecordReadType = z.infer<typeof traceRecordReadSchema>;

export const traceRecordInsertSchema = traceRecordBaseSchema.extend({
  timestamp: z.number(),
  created_at: z.number(),
  updated_at: z.number(),
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
});
export type ScoreRecordBaseType = z.infer<typeof scoreRecordBaseSchema>;

export const scoreRecordReadSchema = scoreRecordBaseSchema.extend({
  created_at: clickhouseStringDateSchema,
  updated_at: clickhouseStringDateSchema,
  timestamp: clickhouseStringDateSchema,
});
export type ScoreRecordReadType = z.infer<typeof scoreRecordReadSchema>;

export const scoreRecordInsertSchema = scoreRecordBaseSchema.extend({
  created_at: z.number(),
  updated_at: z.number(),
  timestamp: z.number(),
});
export type ScoreRecordInsertType = z.infer<typeof scoreRecordInsertSchema>;

export const convertTraceReadToInsert = (
  record: TraceRecordReadType
): TraceRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.created_at).getTime(),
    timestamp: new Date(record.timestamp).getTime(),
  };
};

export const convertObservationReadToInsert = (
  record: ObservationRecordReadType
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
  };
};

export const convertScoreReadToInsert = (
  record: ScoreRecordReadType
): ScoreRecordInsertType => {
  return {
    ...record,
    created_at: new Date(record.created_at).getTime(),
    updated_at: new Date(record.updated_at).getTime(),
    timestamp: new Date(record.timestamp).getTime(),
  };
};
