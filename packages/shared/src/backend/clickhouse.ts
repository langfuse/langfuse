import { createClient } from "@clickhouse/client";
import { env } from "../env";
import { observationRecord, traceRecord } from "./definitions";
import z from "zod";
import { jsonSchema, jsonSchemaNullable } from "./ingestion/types";
import { convertRecordToJsonSchema } from "../utils/json";

export const clickhouseClient = createClient({
  url: env.CLICKHOUSE_URL ?? "http://localhost:8123",
  username: env.CLICKHOUSE_USER ?? "clickhouse",
  password: env.CLICKHOUSE_PASSWORD ?? "clickhouse",
  database: "default",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1, // if disabled, we wont get errors from clickhouse
  },
});
export const convertTraces = (traces: unknown[]) => {
  const parsedRecord = z.array(traceRecord).parse(traces);

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
  const parsedRecord = z.array(observationRecord).parse(jsonRecords);

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
      promptTokens: record.prompt_tokens,
      completionTokens: record.completion_tokens,
      totalTokens: record.total_tokens,
      inputCost: record.input_cost,
      outputCost: record.output_cost,
      totalCost: record.total_cost,
      completionStartTime: record.completion_start_time,
      promptId: record.prompt_id,
    };
  });
}

export const parseJsonPrioritised = (
  json: string
): z.infer<typeof jsonSchema> | string | undefined => {
  try {
    console.log("parseJsonPrioritised", json);
    const parsedJson = JSON.parse(json);
    if (Object.keys(parsedJson).length === 0) {
      return undefined;
    }
    const arr = z.array(jsonSchemaNullable).safeParse(parsedJson);
    if (arr.success) {
      return arr.data;
    }
    const obj = z.record(jsonSchemaNullable).safeParse(parsedJson);
    if (obj.success) {
      return obj.data;
    }

    return jsonSchema.parse(parsedJson);
  } catch (error) {
    return jsonSchema.parse(json);
  }
};
