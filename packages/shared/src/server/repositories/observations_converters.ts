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
  const usageDetails = reduceUsageOrCostDetails(record.usage_details);
  const costDetails = reduceUsageOrCostDetails(record.cost_details);
  const providedCostDetails = reduceUsageOrCostDetails(
    record.provided_cost_details,
  );

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
    promptTokens: usageDetails.input ?? 0,
    completionTokens: usageDetails.output ?? 0,
    totalTokens: usageDetails.total ?? 0,
    calculatedInputCost:
      costDetails.input != null ? new Decimal(costDetails.input) : null,
    calculatedOutputCost:
      costDetails.output != null ? new Decimal(costDetails.output) : null,
    calculatedTotalCost: record.cost_details?.total
      ? new Decimal(record.cost_details.total)
      : null,
    inputCost:
      providedCostDetails.input != null
        ? new Decimal(providedCostDetails.input)
        : null,
    outputCost:
      providedCostDetails.output != null
        ? new Decimal(providedCostDetails.output)
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
      ? parseClickhouseUTCDateTimeFormat(
          record.completion_start_time,
        ).getTime() -
        parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
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
