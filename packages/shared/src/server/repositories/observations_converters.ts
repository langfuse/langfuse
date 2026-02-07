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
  PartialEventsObservation,
  PartialObservation,
  ObservationCoreFields,
} from "../../domain";
import { parseMetadataCHRecordToDomain } from "../utils/metadata_conversion";
import {
  RenderingProps,
  DEFAULT_RENDERING_PROPS,
  applyInputOutputRendering,
  applyInputOutputRenderingAsync,
} from "../utils/rendering";
import { logger } from "../logger";
import type { Model, Price } from "@prisma/client";
import { JsonNested } from "../../utils/zod";

type ModelWithPrice = Model & { Price: Price[] };

/**
 * Converts a Record<string, number> to ensure all values are numbers.
 * Avoids Object.entries/fromEntries chain for better performance.
 * @param record - The record to convert (can be null/undefined)
 * @returns A new object with all values converted to numbers, or empty object if input is null/undefined
 */
function convertNumericRecord(
  record: Record<string, number> | null | undefined,
): Record<string, number> {
  if (!record) return {};
  const result: Record<string, number> = {};
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      result[key] = Number(record[key]);
    }
  }
  return result;
}

/**
 * Validates that all ObservationCoreFields are present and not undefined in a ClickHouse record.
 * Throws an error if any required core field is missing.
 *
 * @param record - The partial observation record from ClickHouse to validate
 * @throws Error if any core field is undefined
 * @returns The validated core fields in domain format
 */
function ensureObservationCoreFields(
  record: Partial<ObservationRecordReadType>,
): ObservationCoreFields {
  const missingFields: string[] = [];

  if (record.id === undefined) missingFields.push("id");
  if (record.trace_id === undefined) missingFields.push("trace_id");
  if (record.start_time === undefined) missingFields.push("start_time");
  if (record.project_id === undefined) missingFields.push("project_id");

  if (missingFields.length > 0) {
    const errorMessage = `Missing required ObservationCoreFields: ${missingFields.join(", ")}${record.id ? ` (record: ${record.id})` : ""}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  return {
    id: record.id!,
    traceId: record.trace_id ?? null,
    startTime: parseClickhouseUTCDateTimeFormat(record.start_time!),
    projectId: record.project_id!,
    parentObservationId: record.parent_observation_id ?? null,
  };
}

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
 * Internal helper to build partial observation from record with pre-parsed input/output.
 * Shared between sync and async conversion functions.
 */
function buildObservationPartialInternal(
  record: Partial<ObservationRecordReadType>,
  parsedInput: JsonNested | string | null | undefined,
  parsedOutput: JsonNested | string | null | undefined,
  complete: boolean,
): Observation | PartialObservation {
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

  // Core fields are not optional
  const coreFields = ensureObservationCoreFields(record);

  const partial = {
    ...coreFields,
    ...(record.type !== undefined && { type: record.type as ObservationType }),
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

    // IO fields (pre-parsed)
    ...(parsedInput !== undefined && { input: parsedInput }),
    ...(parsedOutput !== undefined && { output: parsedOutput }),

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
      usageDetails: convertNumericRecord(record.usage_details),
      inputUsage: reducedUsageDetails.input ?? 0,
      outputUsage: reducedUsageDetails.output ?? 0,
      totalUsage: reducedUsageDetails.total ?? 0,
    }),
    ...(record.cost_details !== undefined && {
      costDetails: convertNumericRecord(record.cost_details),
      inputCost: reducedCostDetails.input,
      outputCost: reducedCostDetails.output,
      totalCost: reducedCostDetails.total,
    }),
    ...(record.provided_cost_details !== undefined && {
      providedCostDetails: convertNumericRecord(record.provided_cost_details),
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

    // Pricing tier fields
    ...(record.usage_pricing_tier_id !== undefined && {
      usagePricingTierId: record.usage_pricing_tier_id ?? null,
    }),
    ...(record.usage_pricing_tier_name !== undefined && {
      usagePricingTierName: record.usage_pricing_tier_name ?? null,
    }),

    // Tool fields
    ...(record.tool_definitions !== undefined && {
      toolDefinitions: record.tool_definitions ?? null,
    }),
    ...(record.tool_calls !== undefined && {
      toolCalls: record.tool_calls ?? null,
    }),
    ...(record.tool_call_names !== undefined && {
      toolCallNames: record.tool_call_names ?? null,
    }),

    // Metrics (calculated fields)
    ...((record.end_time !== undefined || record.start_time !== undefined) && {
      latency:
        record.end_time && record.start_time
          ? (parseClickhouseUTCDateTimeFormat(record.end_time).getTime() -
              parseClickhouseUTCDateTimeFormat(record.start_time).getTime()) /
            1000
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
    return partial;
  }

  // V1 API: fill missing fields with defaults to ensure complete Observation
  return {
    // These fields should always be present from partial conversion
    ...coreFields,
    type: partial.type!,
    environment: partial.environment ?? "",
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
    usagePricingTierId: partial.usagePricingTierId ?? null,
    usagePricingTierName: partial.usagePricingTierName ?? null,
    toolDefinitions: partial.toolDefinitions ?? null,
    toolCalls: partial.toolCalls ?? null,
    toolCallNames: partial.toolCallNames ?? null,
  };
}

/**
 * Convert observation record from ClickHouse to domain model
 * Return type depends on input parameters: either complete Observation or Partial<Observation>
 *
 * @param record - Raw observation record from ClickHouse
 * @param renderingProps - Rendering options for input/output
 * @param complete - If true, fills missing fields with defaults (V1 API). If false/undefined, returns only present fields (V2 API)
 *
 * Type signatures:
 * - convertObservation(record, props, true) → Observation
 * - convertObservation(record, props) → Partial<Observation>
 */
export function convertObservationPartial(
  record: ObservationRecordReadType,
  renderingProps: RenderingProps,
  complete: true,
): Observation;
export function convertObservationPartial(
  record: Partial<ObservationRecordReadType>,
  renderingProps: RenderingProps,
  complete: false,
): PartialObservation;
export function convertObservationPartial(
  record: Partial<ObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete: boolean,
): Observation | PartialObservation {
  const parsedInput =
    record.input !== undefined
      ? applyInputOutputRendering(record.input, renderingProps)
      : undefined;
  const parsedOutput =
    record.output !== undefined
      ? applyInputOutputRendering(record.output, renderingProps)
      : undefined;

  return buildObservationPartialInternal(
    record,
    parsedInput,
    parsedOutput,
    complete,
  );
}

export function convertObservation(
  record: ObservationRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Observation {
  return convertObservationPartial(record, renderingProps, true);
}

/**
 * Async version of convertObservationPartial using non-blocking JSON parsing.
 * Use this for better performance with large input/output payloads.
 */
export async function convertObservationPartialAsync(
  record: ObservationRecordReadType,
  renderingProps: RenderingProps,
  complete: true,
): Promise<Observation>;
export async function convertObservationPartialAsync(
  record: Partial<ObservationRecordReadType>,
  renderingProps: RenderingProps,
  complete: false,
): Promise<PartialObservation>;
export async function convertObservationPartialAsync(
  record: Partial<ObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete: boolean,
): Promise<Observation | PartialObservation> {
  // Parse input/output asynchronously in parallel
  const [parsedInput, parsedOutput] = await Promise.all([
    record.input !== undefined
      ? applyInputOutputRenderingAsync(record.input, renderingProps)
      : Promise.resolve(undefined),
    record.output !== undefined
      ? applyInputOutputRenderingAsync(record.output, renderingProps)
      : Promise.resolve(undefined),
  ]);

  return buildObservationPartialInternal(
    record,
    parsedInput,
    parsedOutput,
    complete,
  );
}

export async function convertObservationAsync(
  record: ObservationRecordReadType,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
): Promise<Observation> {
  return convertObservationPartialAsync(record, renderingProps, true);
}

/**
 * Events-specific converter that includes userId and sessionId fields.
 * Use this for observations from the events table which contain user context.
 */
export function convertEventsObservation(
  record: EventsObservationRecordReadType,
  renderingProps: RenderingProps,
  complete: true,
): EventsObservation;
export function convertEventsObservation(
  record: Partial<EventsObservationRecordReadType>,
  renderingProps: RenderingProps,
  complete: false,
): PartialEventsObservation;
export function convertEventsObservation(
  record: Partial<EventsObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete: boolean,
): EventsObservation | PartialEventsObservation {
  // Branch based on complete flag to use correct overload
  const baseObservation = complete
    ? convertObservationPartial(
        record as ObservationRecordReadType,
        renderingProps,
        true,
      )
    : convertObservationPartial(record, renderingProps, false);

  return {
    ...baseObservation,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
  };
}

/**
 * Async version of convertEventsObservation using non-blocking JSON parsing.
 */
export async function convertEventsObservationAsync(
  record: EventsObservationRecordReadType,
  renderingProps: RenderingProps,
  complete: true,
): Promise<EventsObservation>;
export async function convertEventsObservationAsync(
  record: Partial<EventsObservationRecordReadType>,
  renderingProps: RenderingProps,
  complete: false,
): Promise<PartialEventsObservation>;
export async function convertEventsObservationAsync(
  record: Partial<EventsObservationRecordReadType>,
  renderingProps: RenderingProps = DEFAULT_RENDERING_PROPS,
  complete: boolean,
): Promise<EventsObservation | PartialEventsObservation> {
  // Branch based on complete flag to use correct overload
  const baseObservation = complete
    ? await convertObservationPartialAsync(
        record as ObservationRecordReadType,
        renderingProps,
        true,
      )
    : await convertObservationPartialAsync(record, renderingProps, false);

  return {
    ...baseObservation,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
  };
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
