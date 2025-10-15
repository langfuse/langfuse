import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import { ObservationRecordReadType } from "./definitions";
import {
  Observation,
  ObservationLevelType,
  ObservationType,
} from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import {
  RenderingProps,
  DEFAULT_RENDERING_PROPS,
  applyInputOutputRendering,
} from "../utils/rendering";
import { logger } from "../logger";
import type { Model, Price } from "@prisma/client";

type ModelWithPrice = Model & { Price: Price[] };

/**
 * Enriches observation data with model pricing information
 * @param model - The model with price data (can be null)
 * @returns Object with modelId and pricing fields
 */
export const enrichObservationWithModelData = (
  model: ModelWithPrice | null | undefined,
) => {
  return {
    modelId: model?.id ?? null,
    inputPrice:
      model?.Price?.find((m) => m.usageType === "input")?.price ?? null,
    outputPrice:
      model?.Price?.find((m) => m.usageType === "output")?.price ?? null,
    totalPrice:
      model?.Price?.find((m) => m.usageType === "total")?.price ?? null,
  };
};

export const convertObservation = (
  record: ObservationRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Observation => {
  const reducedCostDetails = reduceUsageOrCostDetails(record.cost_details);
  const reducedUsageDetails = reduceUsageOrCostDetails(record.usage_details);

  if (!record.start_time) {
    logger.error(
      `Found invalid value start_time: ${record.start_time} for record ${record.id} in project ${record.project_id}. Processing will fail.`,
      {
        ...record,
        input: null,
        output: null,
        metadata: null,
      },
    );
  }

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
    input: applyInputOutputRendering(record.input, renderingProps),
    output: applyInputOutputRendering(record.output, renderingProps),
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
    promptVersion: record.prompt_version ? Number(record.prompt_version) : null,
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
