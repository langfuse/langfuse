import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import { parseJsonPrioritised } from "../../utils/json";
import {
  Observation,
  ObservationLevelType,
  ObservationType,
} from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";

export const convertObservation = (
  record: ObservationRecordReadType,
): Observation => {
  const reducedCostDetails = reduceUsageOrCostDetails(record.cost_details);
  const reducedUsageDetails = reduceUsageOrCostDetails(record.usage_details);

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
    metadata: parseMetadataCHRecordToDomain(record.metadata),
    level: record.level as ObservationLevelType,
    statusMessage: record.status_message ?? null,
    version: record.version ?? null,
    input: record.input ? (parseJsonPrioritised(record.input) ?? null) : null,
    output: record.output
      ? (parseJsonPrioritised(record.output) ?? null)
      : null,
    modelParameters: record.model_parameters
      ? (JSON.parse(record.model_parameters) ?? null)
      : null,
    completionStartTime: record.completion_start_time
      ? parseClickhouseUTCDateTimeFormat(record.completion_start_time)
      : null,
    promptId: record.prompt_id ?? null,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
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
    providedCostDetails: Object.fromEntries(
      Object.entries(record.provided_cost_details ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    model: record.provided_model_name ?? null,
    internalModelId: record.internal_model_id ?? null,
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
    inputCost: reducedCostDetails.input,
    outputCost: reducedCostDetails.output,
    totalCost: reducedCostDetails.total,
    inputUsage: reducedUsageDetails.input ?? 0,
    outputUsage: reducedUsageDetails.output ?? 0,
    totalUsage: reducedUsageDetails.total ?? 0,
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
        (acc, [, value]) => (acc ?? 0) + Number(value),
        null as number | null, // default to null if no input usage is found
      ),
    output: Object.entries(details ?? {})
      .filter(([usageType]) => usageType.startsWith("output"))
      .reduce(
        (acc, [, value]) => (acc ?? 0) + Number(value),
        null as number | null, // default to null if no output usage is found
      ),
    total: Number(details?.total ?? 0),
  };
};
