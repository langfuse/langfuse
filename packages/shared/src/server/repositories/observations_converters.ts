import {
  Observation,
  ObservationView,
  ObservationType,
  ObservationLevel,
  Prisma,
} from "@prisma/client";
import Decimal from "decimal.js";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import { parseJsonPrioritised } from "../../utils/json";
import { jsonSchema } from "../../utils/zod";

export const convertObservationToView = (
  record: ObservationRecordReadType,
): Omit<ObservationView, "inputPrice" | "outputPrice" | "totalPrice"> => {
  // these cost are not used from the view. They are in the select statement but not in the
  // Prisma file. We will not clean this up but keep it as it is for now.
  // eslint-disable-next-line no-unused-vars
  const { inputCost, outputCost, totalCost, internalModelId, ...rest } =
    convertObservation(record ?? undefined);
  return {
    ...rest,
    latency: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
      : null,
    timeToFirstToken: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.start_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.completion_start_time).getTime()
      : null,
    promptName: record.prompt_name ?? null,
    promptVersion: record.prompt_version ?? null,
    modelId: record.internal_model_id ?? null,
  };
};

export const convertObservation = (
  record: ObservationRecordReadType,
): Omit<Observation, "internalModel"> & {
  promptName: string | null;
  promptVersion: number | null;
  latency: number | null;
  timeToFirstToken: number | null;
} => {
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
    input: (record.input
      ? jsonSchema.parse(parseJsonPrioritised(record.input))
      : null) as Prisma.JsonValue | null,
    output: (record.output
      ? jsonSchema.parse(parseJsonPrioritised(record.output))
      : null) as Prisma.JsonValue | null,
    modelParameters: record.model_parameters
      ? JSON.parse(record.model_parameters)
      : null,
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
    unit: "TOKENS", // to be removed.
    promptName: record.prompt_name ?? null,
    promptVersion: record.prompt_version ?? null,
    latency: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
      : null,
    timeToFirstToken: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.start_time).getTime() -
        parseClickhouseUTCDateTimeFormat(record.completion_start_time).getTime()
      : null,
  };
};
