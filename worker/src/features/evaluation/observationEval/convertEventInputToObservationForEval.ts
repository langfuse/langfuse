import {
  observationForEvalSchema,
  type ObservationForEval,
} from "@langfuse/shared";

import { type EventInput } from "../../../services/IngestionService";

/**
 * Maps EventInput fields to ObservationForEval schema input.
 * Single source of truth for field mapping to avoid duplication.
 */
function mapEventInputToSchemaInput(event: EventInput) {
  return {
    // Core identifiers
    id: event.spanId,
    traceId: event.traceId,
    projectId: event.projectId,
    parentObservationId: event.parentSpanId,

    // Observation properties
    type: event.type,
    name: event.name,
    environment: event.environment,
    level: event.level,
    statusMessage: event.statusMessage,
    version: event.version,

    // Trace-level properties
    traceName: event.traceName,
    userId: event.userId,
    sessionId: event.sessionId,
    tags: event.tags ?? [],
    release: event.release,

    // Model properties
    model: event.modelName,
    modelParameters:
      typeof event.modelParameters === "string"
        ? event.modelParameters
        : event.modelParameters
          ? JSON.stringify(event.modelParameters)
          : null,

    // Prompt properties
    promptId: event.promptId,
    promptName: event.promptName,
    promptVersion: event.promptVersion,

    // Tool call properties
    toolDefinitions: event.toolDefinitions ?? {},
    toolCalls: event.toolCalls ?? [],
    toolCallNames: event.toolCallNames ?? [],

    // Usage & Cost
    usageDetails: event.usageDetails ?? {},
    costDetails: event.costDetails ?? {},
    providedUsageDetails: event.providedUsageDetails ?? {},
    providedCostDetails: event.providedCostDetails ?? {},

    // Experiment properties
    experimentId: event.experimentId,
    experimentName: event.experimentName,
    experimentDescription: event.experimentDescription,
    experimentDatasetId: event.experimentDatasetId,
    experimentItemId: event.experimentItemId,
    experimentItemExpectedOutput: event.experimentItemExpectedOutput,

    // Data fields
    input: event.input,
    output: event.output,
    metadata: event.metadata ?? {},
  };
}

/**
 * Convert from EventInput (processToEvent output during OTEL ingestion).
 * Used for fresh events that haven't been stored in ClickHouse yet.
 *
 * This converter handles the field mapping from EventInput's loose type
 * to the strict ObservationForEval schema and applies Zod validation.
 *
 * @param event - Event from OtelIngestionProcessor.processToEvent()
 * @returns Validated ObservationForEval instance
 * @throws ZodError if the event doesn't match the expected schema
 *
 * @example
 * ```typescript
 * const events = processor.processToEvent(parsedSpans);
 * const observations = events.map(convertEventInputToObservationForEval);
 * ```
 */
export function convertEventInputToObservationForEval(
  event: EventInput,
): ObservationForEval {
  return observationForEvalSchema.parse(mapEventInputToSchemaInput(event));
}

/**
 * Safely convert from EventInput, returning null on validation failure.
 *
 * Use this when processing batches where individual failures should be
 * logged and skipped rather than throwing an error.
 *
 * @param event - Event from OtelIngestionProcessor.processToEvent()
 * @returns ObservationForEval instance or null if validation fails
 */
export function safeConvertEventInputToObservationForEval(
  event: EventInput,
): ObservationForEval | null {
  const result = observationForEvalSchema.safeParse(
    mapEventInputToSchemaInput(event),
  );
  return result.success ? result.data : null;
}
