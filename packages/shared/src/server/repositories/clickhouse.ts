import Decimal from "decimal.js";
import { z } from "zod";
import { JsonNested } from "../../utils/zod";
import {
  ObservationLevel,
  ObservationType,
  ObservationView,
  Trace,
} from "@prisma/client";
import { parseJsonPrioritised } from "../../utils/json";
import { env } from "../../env";
import {
  clickhouseStringDateSchema,
  observationRecordReadSchema,
  scoreRecordReadSchema,
  traceRecordReadSchema,
} from "../definitions";
import { clickhouseClient } from "../clickhouse/client";
import { logger } from "../logger";
import { getCurrentSpan } from "../instrumentation";

export const getObservation = async (
  observationId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM observations FINAL WHERE id = {observationId: String} AND project_id = {projectId: String} LIMIT 1`;
  const records = await queryClickhouse({
    query,
    params: { observationId, projectId },
  });

  return convertObservations(records).shift();
};

export const getTraceObservations = async (
  traceId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM observations FINAL WHERE trace_id = {traceId: String} AND project_id = {projectId: String}`;
  const records = await queryClickhouse({
    query,
    params: { traceId, projectId },
  });

  return convertObservations(records);
};

export const getScores = async (traceId: string, projectId: string) => {
  const query = `SELECT * FROM scores FINAL where trace_id = {traceId: String} and project_id = {projectId: String}`;
  const records = await queryClickhouse({
    query,
    params: { traceId, projectId },
  });
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

export async function queryClickhouse<T>(opts: {
  query: string;
  params?: Record<string, unknown> | undefined;
}) {
  // https://opentelemetry.io/docs/specs/semconv/database/database-spans/
  getCurrentSpan()?.setAttribute("ch.query.text", opts.query);

  // same logic as for prisma. we want to see queries in development
  if (env.NODE_ENV === "development") {
    logger.info(`clickhouse:query ${opts.query}`);
  }

  const res = await clickhouseClient.query({
    query: opts.query,
    format: "JSONEachRow",
    query_params: opts.params,
  });

  getCurrentSpan()?.setAttribute("ch.queryId", res.query_id);

  // add summary headers to the span. Helps to tune performance
  const summaryHeader = res.response_headers["x-clickhouse-summary"];
  if (summaryHeader) {
    try {
      const summary = Array.isArray(summaryHeader)
        ? JSON.parse(summaryHeader[0])
        : JSON.parse(summaryHeader);
      for (const key in summary) {
        getCurrentSpan()?.setAttribute(`ch.${key}`, summary[key]);
      }
    } catch (error) {
      logger.debug(
        `Failed to parse clickhouse summary header ${summaryHeader}`,
        error,
      );
    }
  }

  return res.json<T>();
}

export function convertObservations(jsonRecords: unknown[]): ObservationView[] {
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
      unit: null,

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

      promptTokens: record.usage_details.input ?? 0,
      completionTokens: record.usage_details.output ?? 0,
      totalTokens: record.usage_details.total ?? 0,

      calculatedInputCost: new Decimal(record.cost_details.input ?? 0) || null,
      calculatedOutputCost:
        new Decimal(record.cost_details.output ?? 0) || null,
      calculatedTotalCost: new Decimal(record.cost_details.total ?? 0) || null,

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
