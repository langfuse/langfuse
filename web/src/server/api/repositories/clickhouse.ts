import {
  parseJsonPrioritised,
  type JsonNested,
  type ObservationType,
  type ObservationLevel,
  type Trace,
  type ObservationView,
} from "@langfuse/shared";
import {
  clickhouseClient,
  clickhouseStringDateSchema,
  observationRecordReadSchema,
  scoreRecordReadSchema,
  traceRecordReadSchema,
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import { z } from "zod";

export const getObservation = async (
  observationId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM observations FINAL WHERE id = '${observationId}' AND project_id = '${projectId}' LIMIT 1`;
  const records = await queryClickhouse(query);

  return records.length ? convertObservations(records)[0] : undefined;
};

export const getTraceObservations = async (
  traceId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM observations FINAL where trace_id = '${traceId}' and project_id = '${projectId}'`;
  const records = await queryClickhouse(query);

  return convertObservations(records);
};

export const getTrace = async (traceId: string, projectId: string) => {
  const query = `SELECT * FROM traces FINAL where id = '${traceId}' and project_id = '${projectId}' LIMIT 1`;
  const records = await queryClickhouse(query);

  return records.length ? convertTraces(records)[0] : undefined;
};

export const getScores = async (traceId: string, projectId: string) => {
  const query = `SELECT * FROM scores FINAL where trace_id = '${traceId}' and project_id = '${projectId}'`;
  const records = await queryClickhouse(query);
  const parsedRecords = z.array(scoreRecordReadSchema).parse(records);

  return parsedRecords.map((record) => {
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

async function queryClickhouse(query: string) {
  return (
    await clickhouseClient.query({ query, format: "JSONEachRow" })
  ).json();
}

function convertObservations(jsonRecords: unknown[]): ObservationView[] {
  const parsedRecord = z.array(observationRecordReadSchema).parse(jsonRecords);

  const parsedObservations = parsedRecord.map((record) => {
    const convertedRecord: ObservationView = {
      id: record.id,
      projectId: record.project_id,
      traceId: record.trace_id ?? null,
      parentObservationId: record.parent_observation_id ?? null,
      type: record.type as ObservationType,
      name: record.name ?? null,

      level: record.level as ObservationLevel,
      version: record.version ?? null,
      model: record.provided_model_name ?? null,
      input:
        (record.input ? parseJsonPrioritised(record.input) : undefined) ?? null,
      output:
        (record.output ? parseJsonPrioritised(record.output) : undefined) ??
        null,
      unit: record.unit ?? null,

      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      startTime: new Date(record.start_time),
      endTime: record.end_time ? new Date(record.end_time) : null,

      statusMessage: record.status_message ?? null,
      modelParameters:
        (record.model_parameters
          ? parseJsonPrioritised(record.model_parameters)
          : null) ?? null,
      metadata: convertRecordToJsonSchema(record.metadata) ?? null,

      completionStartTime: record.completion_start_time
        ? new Date(
            clickhouseStringDateSchema.parse(record.completion_start_time),
          )
        : null,

      promptTokens: record.provided_input_usage_units ?? 0,
      completionTokens: record.provided_output_usage_units ?? 0,
      totalTokens: record.provided_total_usage_units ?? 0,

      calculatedInputCost: new Decimal(record.input_cost ?? 0) || null,
      calculatedOutputCost: new Decimal(record.output_cost ?? 0) || null,
      calculatedTotalCost: new Decimal(record.total_cost ?? 0) || null,

      promptId: record.prompt_id ?? null,
      promptName: record.prompt_name ?? null,
      promptVersion: record.prompt_version ?? null,

      modelId: record.internal_model_id ?? null,
      inputPrice: null,
      outputPrice: null,
      totalPrice: null,
      latency: null,
      timeToFirstToken: null,
    };

    return convertedRecord;
  });

  return parsedObservations;
}

export const convertTraces = (traces: unknown[]): Trace[] => {
  const parsedRecord = z.array(traceRecordReadSchema).parse(traces);

  return parsedRecord.map((record) => {
    const convertedTrace: Trace = {
      id: record.id,
      timestamp: new Date(record.timestamp),
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
      name: record.name ?? null,
      release: record.release ?? null,
      version: record.version ?? null,
      bookmarked: record.bookmarked,
      tags: record.tags,
      input:
        (record.input ? parseJsonPrioritised(record.input) : undefined) ?? null,
      output:
        (record.output ? parseJsonPrioritised(record.output) : undefined) ??
        null,
      projectId: record.project_id,
      userId: record.user_id ?? null,
      public: record.public,
      sessionId: record.session_id ?? null,
      metadata: convertRecordToJsonSchema(record.metadata) ?? null,
      externalId: null,
    };

    return convertedTrace;
  });
};
