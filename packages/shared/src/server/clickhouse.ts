import { createClient } from "@clickhouse/client";
import { env } from "../env";
import { observationRecordRead, traceRecordRead } from "./definitions";
import z from "zod";
import { convertRecordToJsonSchema, parseJsonPrioritised } from "../utils/json";

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USER,
  password: env.CLICKHOUSE_PASSWORD,
  database: "default",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // if disabled, we wont get errors from clickhouse
  },
});
export const convertTraces = (traces: unknown[]) => {
  const parsedRecord = z.array(traceRecordRead).parse(traces);

  return parsedRecord.map((record) => {
    return {
      id: record.id,
      timestamp: record.timestamp,
      name: record.name,
      release: record.release,
      version: record.version,
      bookmarked: record.bookmarked,
      tags: record.tags,
      input: record.input ? parseJsonPrioritised(record.input) : undefined,
      output: record.output ? parseJsonPrioritised(record.output) : undefined,
      projectId: record.project_id,
      userId: record.user_id,
      public: record.public,
      sessionId: record.session_id,
      createdAt: record.created_at,
      metadata: convertRecordToJsonSchema(record.metadata),
    };
  });
};

export function convertObservations(jsonRecords: unknown[]) {
  const parsedRecord = z.array(observationRecordRead).parse(jsonRecords);

  return parsedRecord.map((record) => {
    return {
      id: record.id,
      traceId: record.trace_id,
      projectId: record.project_id,
      type: record.type,
      name: record.name,
      level: record.level,
      version: record.version,
      model: record.model,
      input: record.input ? parseJsonPrioritised(record.input) : undefined,
      output: record.output ? parseJsonPrioritised(record.output) : undefined,
      unit: record.unit,
      parentId: record.parent_observation_id,
      createdAt: record.created_at,
      startTime: record.start_time,
      endTime: record.end_time,
      statusMessage: record.status_message,
      internalModel: record.internal_model,
      modelParameters: record.model_parameters
        ? parseJsonPrioritised(record.model_parameters)
        : null,
      metadata: convertRecordToJsonSchema(record.metadata),
      promptTokens: record.input_usage,
      completionTokens: record.output_usage,
      totalTokens: record.total_usage,
      inputCost: record.input_cost,
      outputCost: record.output_cost,
      totalCost: record.total_cost,
      completionStartTime: record.completion_start_time,
      promptId: record.prompt_id,
    };
  });
}
