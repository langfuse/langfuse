import z from "zod";
export const clickhouseStringDate = z
  .string()
  // clickhouse stores UTC like '2024-05-23 18:33:41.602000'
  // we need to convert it to '2024-05-23T18:33:41.602000Z'
  .transform((str) => str.replace(" ", "T") + "Z")
  .pipe(z.string().datetime());

export const observationRecordBase = z.object({
  id: z.string(),
  trace_id: z.string().nullish(),
  project_id: z.string(),
  type: z.string().nullish(),
  parent_observation_id: z.string().nullish(),
  name: z.string().nullish(),
  metadata: z.record(z.string()),
  level: z.string().nullish(),
  status_message: z.string().nullish(),
  version: z.string().nullish(),
  input: z.string().nullish(),
  output: z.string().nullish(),
  model: z.string().nullish(),
  internal_model: z.string().nullish(),
  model_parameters: z.string().nullish(),
  prompt_tokens: z.number().nullish(),
  completion_tokens: z.number().nullish(),
  total_tokens: z.number().nullish(),
  unit: z.string().nullish(),
  input_cost: z.number().nullish(),
  output_cost: z.number().nullish(),
  total_cost: z.number().nullish(),
  completion_start_time: z.date().nullish(),
  prompt_id: z.string().nullish(),
});

export const observationRecordRead = observationRecordBase.extend({
  created_at: clickhouseStringDate,
  start_time: clickhouseStringDate,
  end_time: clickhouseStringDate,
});

export const observationRecordInsert = observationRecordBase.extend({
  created_at: z.number(),
  start_time: z.number(),
  end_time: z.number(),
});

export const traceRecordBase = z.object({
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

export const traceRecordRead = traceRecordBase.extend({
  timestamp: clickhouseStringDate,
  created_at: clickhouseStringDate,
});

export const traceRecordInsert = traceRecordBase.extend({
  timestamp: z.number(),
  created_at: z.number(),
});

export const scoreRecord = z.object({
  id: z.string(),
  timestamp: clickhouseStringDate,
  project_id: z.string(),
  name: z.string().nullish(),
  value: z.number().nullish(),
  source: z.string(),
  comment: z.string().nullish(),
  trace_id: z.string(),
  observation_id: z.string().nullish(),
});
