import { parseClickhouseUTCDateTimeFormat } from "./clickhouse";
import {
  ObservationRecordReadType,
  EventsObservationRecordReadType,
} from "./definitions";
import {
  Observation,
  EventsObservation,
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

/**
 * Convert observation record from ClickHouse to domain model
 * Uses type-level dispatch to return either complete Observation or Partial<Observation>
 *
 * @param record - Raw observation record from ClickHouse
 * @param renderingProps - Rendering options for input/output
 * @param complete - If true, fills missing fields with defaults (V1 API). If false/undefined, returns only present fields (V2 API)
 *
 * Type-level dispatch:
 * - convertObservation(record, props, true) → Observation
 * - convertObservation(record, props) → Partial<Observation>
 */
export function convertObservationPartial<
  Complete extends boolean = false,
  R = Complete extends true ? Observation : Partial<Observation>,
>(
  record: Partial<ObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete?: Complete,
): R {
  // Core fields validation - these should always be present
  if (record.start_time !== undefined && !record.start_time) {
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

  const reducedCostDetails =
    record.cost_details !== undefined
      ? reduceUsageOrCostDetails(record.cost_details)
      : { input: null, output: null, total: null };

  const reducedUsageDetails =
    record.usage_details !== undefined
      ? reduceUsageOrCostDetails(record.usage_details)
      : { input: null, output: null, total: null };

  const partial = {
    // Core fields
    ...(record.id !== undefined && { id: record.id }),
    ...(record.trace_id !== undefined && { traceId: record.trace_id ?? null }),
    ...(record.project_id !== undefined && { projectId: record.project_id }),
    ...(record.type !== undefined && { type: record.type as ObservationType }),
    ...(record.parent_observation_id !== undefined && {
      parentObservationId: record.parent_observation_id ?? null,
    }),
    ...(record.start_time !== undefined && {
      startTime: parseClickhouseUTCDateTimeFormat(record.start_time),
    }),
    ...(record.end_time !== undefined && {
      endTime: record.end_time
        ? parseClickhouseUTCDateTimeFormat(record.end_time)
        : null,
    }),

    // Basic fields
    ...(record.name !== undefined && { name: record.name ?? null }),
    ...(record.level !== undefined && {
      level: record.level as ObservationLevelType,
    }),
    ...(record.status_message !== undefined && {
      statusMessage: record.status_message ?? null,
    }),
    ...(record.version !== undefined && { version: record.version ?? null }),
    ...(record.environment !== undefined && {
      environment: record.environment,
    }),

    // Time fields
    ...(record.completion_start_time !== undefined && {
      completionStartTime: record.completion_start_time
        ? parseClickhouseUTCDateTimeFormat(record.completion_start_time)
        : null,
    }),
    ...(record.created_at !== undefined && {
      createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    }),
    ...(record.updated_at !== undefined && {
      updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    }),

    // IO fields
    ...(record.input !== undefined && {
      input: applyInputOutputRendering(record.input, renderingProps),
    }),
    ...(record.output !== undefined && {
      output: applyInputOutputRendering(record.output, renderingProps),
    }),

    // Metadata
    ...(record.metadata !== undefined && {
      metadata: parseMetadataCHRecordToDomain(record.metadata),
    }),

    // Model fields
    ...(record.provided_model_name !== undefined && {
      model: record.provided_model_name ?? null,
    }),
    ...(record.internal_model_id !== undefined && {
      internalModelId: record.internal_model_id ?? null,
    }),
    ...(record.model_parameters !== undefined && {
      modelParameters: record.model_parameters
        ? ((typeof record.model_parameters === "string"
            ? JSON.parse(record.model_parameters)
            : record.model_parameters) ?? null)
        : null,
    }),

    // Usage fields
    ...(record.usage_details !== undefined && {
      usageDetails: Object.fromEntries(
        Object.entries(record.usage_details ?? {}).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
      inputUsage: reducedUsageDetails.input ?? 0,
      outputUsage: reducedUsageDetails.output ?? 0,
      totalUsage: reducedUsageDetails.total ?? 0,
    }),
    ...(record.cost_details !== undefined && {
      costDetails: Object.fromEntries(
        Object.entries(record.cost_details ?? {}).map(([key, value]) => [
          key,
          Number(value),
        ]),
      ),
      inputCost: reducedCostDetails.input,
      outputCost: reducedCostDetails.output,
      totalCost: reducedCostDetails.total,
    }),
    ...(record.provided_cost_details !== undefined && {
      providedCostDetails: Object.fromEntries(
        Object.entries(record.provided_cost_details ?? {}).map(
          ([key, value]) => [key, Number(value)],
        ),
      ),
    }),

    // Prompt fields
    ...(record.prompt_id !== undefined && {
      promptId: record.prompt_id ?? null,
    }),
    ...(record.prompt_name !== undefined && {
      promptName: record.prompt_name ?? null,
    }),
    ...(record.prompt_version !== undefined && {
      promptVersion: record.prompt_version
        ? Number(record.prompt_version)
        : null,
    }),

    // Metrics (calculated fields)
    ...((record.end_time !== undefined || record.start_time !== undefined) && {
      latency:
        record.end_time && record.start_time
          ? parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
            parseClickhouseUTCDateTimeFormat(record.start_time).getTime()
          : null,
    }),
    ...((record.completion_start_time !== undefined ||
      record.start_time !== undefined) && {
      timeToFirstToken:
        record.completion_start_time && record.start_time
          ? (parseClickhouseUTCDateTimeFormat(
              record.completion_start_time,
            ).getTime() -
              parseClickhouseUTCDateTimeFormat(record.start_time).getTime()) /
            1000
          : null,
    }),
  };

  // V2 API: return partial observation (only fields that were present in record)
  if (!complete) {
    return partial as R;
  }

  // V1 API: fill missing fields with defaults to ensure complete Observation
  return {
    // These fields should always be present from partial conversion
    id: partial.id!,
    traceId: partial.traceId ?? null,
    projectId: partial.projectId!,
    type: partial.type!,
    environment: partial.environment ?? "",
    parentObservationId: partial.parentObservationId ?? null,
    startTime: partial.startTime!,
    endTime: partial.endTime ?? null,
    name: partial.name ?? null,
    level: partial.level ?? "DEFAULT",
    statusMessage: partial.statusMessage ?? null,
    version: partial.version ?? null,
    createdAt: partial.createdAt!,
    updatedAt: partial.updatedAt!,

    // Fields that may not be selected from ClickHouse (default to null)
    input: partial.input ?? null,
    output: partial.output ?? null,
    metadata: partial.metadata ?? {},
    model: partial.model ?? null,
    internalModelId: partial.internalModelId ?? null,
    modelParameters: partial.modelParameters ?? null,
    completionStartTime: partial.completionStartTime ?? null,
    promptId: partial.promptId ?? null,
    promptName: partial.promptName ?? null,
    promptVersion: partial.promptVersion ?? null,
    latency: partial.latency ?? null,
    timeToFirstToken: partial.timeToFirstToken ?? null,
    usageDetails: partial.usageDetails ?? {},
    costDetails: partial.costDetails ?? {},
    providedCostDetails: partial.providedCostDetails ?? {},
    inputCost: partial.inputCost ?? null,
    outputCost: partial.outputCost ?? null,
    totalCost: partial.totalCost ?? null,
    inputUsage: partial.inputUsage ?? 0,
    outputUsage: partial.outputUsage ?? 0,
    totalUsage: partial.totalUsage ?? 0,
  } as R;
}

export function convertObservation(
  record: ObservationRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Observation {
  return convertObservationPartial(record, renderingProps, true);
}

/**
 * Events-specific converter that includes userId and sessionId fields.
 * Use this for observations from the events table which contain user context.
 */
export function convertEventsObservation<
  Complete extends boolean = false,
  R = Complete extends true ? EventsObservation : Partial<EventsObservation>,
>(
  record: Partial<EventsObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete?: Complete,
): R {
  const baseObservation = convertObservationPartial(
    record,
    renderingProps,
    complete,
  );

  return {
    ...baseObservation,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
  } as R;
}

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
