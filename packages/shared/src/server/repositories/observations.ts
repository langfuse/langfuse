import { ObservationClickhouseRecord } from "../clickhouse/schema";
import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import {
  Model,
  Observation,
  ObservationLevel,
  ObservationType,
  ObservationView,
  Price,
} from "@prisma/client";
import { logger } from "../logger";
import { InternalServerError, LangfuseNotFoundError } from "../../errors";
import Decimal from "decimal.js";
import { prisma } from "../../db";
import { jsonSchema } from "../../utils/zod";
import { ObservationRecordReadType } from "./definitions";

export const convertObservation = async (
  record: ObservationRecordReadType,
): Promise<Observation> => {
  const model = record.internal_model_id
    ? await prisma.model.findFirst({
        where: {
          id: record.internal_model_id,
        },
        include: {
          Price: true,
        },
      })
    : undefined;
  return await convertObservationAndModel(record, model);
};

export const convertObservationToView = async (
  record: ObservationRecordReadType,
): Promise<ObservationView> => {
  const model = record.internal_model_id
    ? await prisma.model.findFirst({
        where: {
          id: record.internal_model_id,
        },
        include: {
          Price: true,
        },
      })
    : undefined;
  return {
    ...(await convertObservationAndModel(record, model)),
    latency: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
      : null,
    timeToFirstToken: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.start_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.completion_start_time).getTime()
      : null,
    inputPrice:
      model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
    outputPrice:
      model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
    totalPrice:
      model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
    promptName: record.prompt_name ?? null,
    promptVersion: record.prompt_version ?? null,
    modelId: record.internal_model_id ?? null,
  };
};

const convertObservationAndModel = async (
  record: ObservationRecordReadType,
  model?: (Model & { Price: Price[] }) | null,
): Promise<Observation> => {
  return {
    id: record.id,
    traceId: record.trace_id ?? null,
    projectId: record.project_id,
    type: record.type as ObservationType,
    parentObservationId: record.parent_observation_id ?? null,
    startTime: parseClickhouseUTCDateTimeFormat(record.start_time),
    endTime: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time)
      : null,
    name: record.name ?? null,
    metadata: record.metadata,
    level: record.level as ObservationLevel,
    statusMessage: record.status_message ?? null,
    version: record.version ?? null,
    input: jsonSchema.nullish().parse(record.input) ?? null,
    output: jsonSchema.nullish().parse(record.output) ?? null,
    modelParameters: jsonSchema.nullable().parse(record.model_parameters),
    completionStartTime: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.completion_start_time)
      : null,
    promptId: record.prompt_id ?? null,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    promptTokens: record.usage_details?.input ?? 0,
    completionTokens: record.usage_details?.output ?? 0,
    totalTokens: record.usage_details?.total ?? 0,
    calculatedInputCost: record.cost_details?.input
      ? new Decimal(record.cost_details.input)
      : null,
    calculatedOutputCost: record.cost_details?.output
      ? new Decimal(record.cost_details.output)
      : null,
    calculatedTotalCost: record.cost_details?.total
      ? new Decimal(record.cost_details.total)
      : null,
    inputCost: record.cost_details?.input
      ? new Decimal(record.cost_details?.input)
      : null,
    outputCost: record.cost_details?.output
      ? new Decimal(record.cost_details?.output)
      : null,
    totalCost: record.cost_details?.total
      ? new Decimal(record.cost_details?.total)
      : null,

    model: record.provided_model_name ?? null,
    internalModelId: record.internal_model_id ?? null,
    internalModel: model?.modelName ?? null, // to be removed
    unit: model?.Price?.shift()?.usageType ?? null,
  };
};

export const getObservationsViewForTrace = async (
  traceId: string,
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    created_at,
    updated_at,
    event_ts
  FROM observations FINAL WHERE trace_id = {traceId: String} AND project_id = {projectId: String}`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: { traceId, projectId },
  });

  return await Promise.all(
    records.map(async (o) => await convertObservationToView(o)),
  );
};

export const getObservationById = async (
  id: string,
  projectId: string,
  fetchWithInputOutput: boolean = false,
) => {
  const query = `
  SELECT
    id,
    trace_id,
    project_id,
    type,
    parent_observation_id,
    start_time,
    end_time,
    name,
    metadata,
    level,
    status_message,
    version,
    ${fetchWithInputOutput ? "input, output," : ""}
    provided_model_name,
    internal_model_id,
    model_parameters,
    provided_usage_details,
    usage_details,
    provided_cost_details,
    cost_details,
    total_cost,
    completion_start_time,
    prompt_id,
    prompt_name,
    prompt_version,
    created_at,
    updated_at,
    event_ts
  FROM observations FINAL WHERE id = {id: String} AND project_id = {projectId: String}`;
  const records = await queryClickhouse<ObservationRecordReadType>({
    query,
    params: { id, projectId },
  });

  const mapped = await Promise.all(
    records.map(async (r) => await convertObservation(r)),
  );

  if (mapped.length === 0) {
    throw new LangfuseNotFoundError(`Observation with id ${id} not found`);
  }

  if (mapped.length > 1) {
    logger.error(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
    throw new InternalServerError(
      `Multiple observations found for id ${id} and project ${projectId}`,
    );
  }
  return mapped.shift() as Observation;
};
