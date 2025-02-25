import { Prisma } from "@prisma/client";
import Decimal from "decimal.js";
import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import { parseJsonPrioritised } from "../../utils/json";
import {
  Observation,
  ObservationView,
  ObservationType,
  ObservationLevelType,
} from "./types";

export const convertObservationToView = (
  record: ObservationRecordReadType,
): Omit<ObservationView, "inputPrice" | "outputPrice" | "totalPrice"> & {
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
} => {
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
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
} => {
  const reducedUsageDetails = reduceUsageOrCostDetails(record.usage_details);
  const reducedCostDetails = reduceUsageOrCostDetails(record.cost_details);
  const reducedProvidedCostDetails = reduceUsageOrCostDetails(
    record.provided_cost_details,
  );

  return {
    id: record.id,
    traceId: record.trace_id ?? null,
    projectId: record.project_id,
    type: record.type as ObservationType,
    environment: record.environment,
    parentObservationId: record.parent_observation_id ?? null,
    startTime: parseClickhouseUTCDateTimeFormat(record.start_time),
    endTime: record.end_time
      ? parseClickhouseUTCDateTimeFormat(record.end_time)
      : null,
    name: record.name ?? null,
    metadata:
      record.metadata &&
      Object.fromEntries(
        Object.entries(record.metadata ?? {}).map(([key, val]) => [
          key,
          val && parseJsonPrioritised(val),
        ]),
      ),
    level: record.level as ObservationLevelType,
    statusMessage: record.status_message ?? null,
    version: record.version ?? null,
    input: (record.input
      ? parseJsonPrioritised(record.input)
      : null) as Prisma.JsonValue | null,
    output: (record.output
      ? parseJsonPrioritised(record.output)
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
    promptTokens: reducedUsageDetails.input ?? 0,
    completionTokens: reducedUsageDetails.output ?? 0,
    totalTokens: reducedUsageDetails.total ?? 0,
    calculatedInputCost:
      reducedCostDetails.input != null
        ? new Decimal(reducedCostDetails.input)
        : null,
    calculatedOutputCost:
      reducedCostDetails.output != null
        ? new Decimal(reducedCostDetails.output)
        : null,
    calculatedTotalCost: record.cost_details?.total
      ? new Decimal(record.cost_details.total)
      : null,
    inputCost:
      reducedProvidedCostDetails.input != null
        ? new Decimal(reducedProvidedCostDetails.input)
        : null,
    outputCost:
      reducedProvidedCostDetails.output != null
        ? new Decimal(reducedProvidedCostDetails.output)
        : null,
    totalCost: record.total_cost ? new Decimal(record.total_cost) : null,
    usageDetails: Object.fromEntries(
      Object.entries(record.usage_details ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    costDetails: Object.fromEntries(
      Object.entries(record.cost_details ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
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
      ? (parseClickhouseUTCDateTimeFormat(
          record.completion_start_time,
        ).getTime() -
          parseClickhouseUTCDateTimeFormat(record.start_time).getTime()) /
        1000
      : null,
  };
};

export const reduceUsageOrCostDetails = (
  details: Record<string, number> | null | undefined,
): {
  input: number | null;
  output: number | null;
  total: number | null;
} => {
  return {
    input: Object.entries(details ?? {})
      .filter(([usageType]) => usageType.startsWith("input"))
      .reduce(
        (acc, [_, value]) => (acc ?? 0) + Number(value),
        null as number | null, // default to null if no input usage is found
      ),
    output: Object.entries(details ?? {})
      .filter(([usageType]) => usageType.startsWith("output"))
      .reduce(
        (acc, [_, value]) => (acc ?? 0) + Number(value),
        null as number | null, // default to null if no output usage is found
      ),
    total: Number(details?.total ?? 0),
  };
};
