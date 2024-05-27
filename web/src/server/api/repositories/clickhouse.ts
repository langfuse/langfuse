import {
  jsonSchema,
  jsonSchemaNullable,
  type JsonNested,
} from "@/src/utils/zod";
import {
  clickhouseClient,
  observationRecord,
  scoreRecord,
  traceRecord,
} from "@langfuse/shared/backend";
import { z } from "zod";

export const getObservation = async (
  observationId: string,
  projectId: string,
) => {
  const observation = await clickhouseClient.query({
    query: `SELECT * FROM observations_view where id = '${observationId}' and project_id = '${projectId}' LIMIT 1`,
    format: "JSONEachRow",
  });
  const jsonRecords = await observation.json();
  if (jsonRecords.length === 0) {
    return undefined;
  }
  return convertObservations(jsonRecords)[0];
};

export const getObservations = async (traceId: string, projectId: string) => {
  const observations = await clickhouseClient.query({
    query: `SELECT * FROM observations_view where trace_id = '${traceId}' and project_id = '${projectId}'`,
    format: "JSONEachRow",
  });
  const jsonRecords = await observations.json();
  console.log("observations", jsonRecords);

  return convertObservations(jsonRecords);
};

export const parseJsonPrioritised = (
  json: string,
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
export const getTraces = async (traceId: string, projectId: string) => {
  const trace = await clickhouseClient.query({
    query: `SELECT * FROM traces_view where id = '${traceId}' and project_id = '${projectId}' LIMIT 1`,
    format: "JSONEachRow",
  });
  const traceJson = await trace.json();

  console.log("traceJson", traceJson);

  const parsedRecord = z.array(traceRecord).parse(traceJson);

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
      updatedAt: record.updated_at,
      metadata: convertRecordToJsonSchema(record.metadata),
    };
  });
};

export const getScores = async (traceId: string, projectId: string) => {
  const scores = await clickhouseClient.query({
    query: `SELECT * FROM scores_view where trace_id = '${traceId}' and project_id = '${projectId}'`,
    format: "JSONEachRow",
  });
  const jsonRecords = await scores.json();

  console.log("scores", jsonRecords);

  const parsedRecord = z.array(scoreRecord).parse(jsonRecords);

  return parsedRecord.map((record) => {
    return {
      ...record,
      projectId: record.project_id,
      observationId: record.observation_id,
      traceId: record.trace_id,
    };
  });
};

export const convertRecordToJsonSchema = (
  record: Record<string, string>,
): JsonNested | undefined => {
  const jsonSchema: JsonNested = {};

  // if record is empty, return undefined
  if (Object.keys(record).length === 0) {
    return undefined;
  }

  for (const key in record) {
    try {
      jsonSchema[key] = JSON.parse(record[key]);
    } catch (e) {
      jsonSchema[key] = record[key];
    }
  }

  return jsonSchema;
};

function convertObservations(jsonRecords: unknown[]) {
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
