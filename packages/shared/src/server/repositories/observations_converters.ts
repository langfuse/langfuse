import {
  Observation,
  ObservationView,
  Model,
  Price,
  ObservationType,
  ObservationLevel,
} from "@prisma/client";
import Decimal from "decimal.js";
import { prisma } from "../../db";
import { jsonSchema } from "../../utils/zod";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
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
  return convertObservationAndModel(record, model ?? undefined);
};

export const convertObservationToView = async (
  record: ObservationRecordReadType,
  providedModel?: Model & { Price: Price[] },
): Promise<ObservationView> => {
  const model =
    providedModel ??
    (record.internal_model_id
      ? await prisma.model.findFirst({
          where: {
            id: record.internal_model_id,
          },
          include: {
            Price: true,
          },
        })
      : undefined);
  return {
    ...convertObservationAndModel(record, model ?? undefined),
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

export const convertObservationAndModel = (
  record: ObservationRecordReadType,
  model?: Model & { Price: Price[] },
): Observation => {
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
    promptTokens: record.usage_details?.input
      ? Number(record.usage_details?.input)
      : 0,
    completionTokens: record.usage_details?.output
      ? Number(record.usage_details?.output)
      : 0,
    totalTokens: record.usage_details?.total
      ? Number(record.usage_details?.total)
      : 0,
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
    totalCost: record.total_cost ? new Decimal(record.total_cost) : null,
    model: record.provided_model_name ?? null,
    internalModelId: record.internal_model_id ?? null,
    internalModel: model?.modelName ?? null, // to be removed
    unit: "TOKENS", // to be removed.
  };
};
