import { type EventRecordReadType } from "../../server/repositories/definitions";

import {
  observationForEvalSchema,
  type ObservationForEval,
} from "./observationForEval";

/**
 * Maps EventRecordReadType fields to ObservationForEval schema input.
 * Single source of truth for field mapping to avoid duplication.
 */
function mapEventRecordToSchemaInput(record: EventRecordReadType) {
  return {
    // Core identifiers
    id: record.span_id,
    traceId: record.trace_id,
    projectId: record.project_id,
    parentObservationId: record.parent_span_id,

    // Observation properties
    type: record.type,
    name: record.name,
    environment: record.environment,
    level: record.level,
    statusMessage: record.status_message,
    version: record.version,

    // Trace-level properties
    traceName: record.trace_name,
    userId: record.user_id,
    sessionId: record.session_id,
    tags: record.tags ?? [],
    release: record.release,

    // Model properties
    model: record.provided_model_name,
    modelParameters: record.model_parameters,

    // Prompt properties
    promptId: record.prompt_id,
    promptName: record.prompt_name,
    promptVersion: record.prompt_version,

    // Tool call properties
    toolDefinitions: record.tool_definitions ?? {},
    toolCalls: record.tool_calls ?? [],
    toolCallNames: record.tool_call_names ?? [],

    // Usage & Cost
    usageDetails: record.usage_details ?? {},
    costDetails: record.cost_details ?? {},
    providedUsageDetails: record.provided_usage_details ?? {},
    providedCostDetails: record.provided_cost_details ?? {},

    // Experiment properties
    experimentId: record.experiment_id,
    experimentName: record.experiment_name,
    experimentDescription: record.experiment_description,
    experimentDatasetId: record.experiment_dataset_id,
    experimentItemId: record.experiment_item_id,
    experimentItemExpectedOutput: record.experiment_item_expected_output,

    // Data fields
    input: record.input,
    output: record.output,
    metadata: record.metadata ?? {},
  };
}

/**
 * Convert from EventRecordReadType (ClickHouse events table).
 * Used for historical records when triggering evals on existing data.
 *
 * This converter handles the snake_case to camelCase field mapping and
 * applies Zod validation to ensure the record conforms to the expected schema.
 *
 * @param record - Raw record from ClickHouse events table
 * @returns Validated ObservationForEval instance
 * @throws ZodError if the record doesn't match the expected schema
 *
 * @example
 * ```typescript
 * const records = await queryClickhouse<EventRecordReadType>({ ... });
 * const observations = records.map(convertEventRecordToObservationForEval);
 * ```
 */
export function convertEventRecordToObservationForEval(
  record: EventRecordReadType,
): ObservationForEval {
  return observationForEvalSchema.parse(mapEventRecordToSchemaInput(record));
}

/**
 * Safely convert from EventRecordReadType, returning null on validation failure.
 *
 * Use this when processing batches where individual failures should be skipped
 * rather than throwing an error.
 *
 * @param record - Raw record from ClickHouse events table
 * @returns ObservationForEval instance or null if validation fails
 *
 * @example
 * ```typescript
 * const records = await queryClickhouse<EventRecordReadType>({ ... });
 * const observations = records
 *   .map(safeConvertEventRecordToObservationForEval)
 *   .filter((o): o is ObservationForEval => o !== null);
 * ```
 */
export function safeConvertEventRecordToObservationForEval(
  record: EventRecordReadType,
): ObservationForEval | null {
  const result = observationForEvalSchema.safeParse(
    mapEventRecordToSchemaInput(record),
  );
  return result.success ? result.data : null;
}
