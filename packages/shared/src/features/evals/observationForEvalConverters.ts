import { type EventRecordBaseType } from "../../server/repositories/definitions";

import {
  observationForEvalSchema,
  type ObservationForEval,
} from "./observationForEval";

/**
 * Convert any event record (Insert or Read type) to ObservationForEval.
 *
 * Works with both EventRecordInsertType and EventRecordReadType since they
 * both extend EventRecordBaseType, and ObservationForEval only uses fields
 * from the base schema.
 *
 * @param record - Event record from ClickHouse (read) or ingestion (insert)
 * @returns Validated ObservationForEval instance
 * @throws ZodError if validation fails
 *
 * @example
 * ```typescript
 * // During ingestion (from createEventRecord)
 * const insertRecord: EventRecordInsertType = await createEventRecord(...);
 * const observation = convertEventRecordToObservationForEval(insertRecord);
 *
 * // For historical evals (from ClickHouse query)
 * const readRecord: EventRecordReadType = await queryClickhouse(...);
 * const observation = convertEventRecordToObservationForEval(readRecord);
 * ```
 */
export function convertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval {
  return observationForEvalSchema.parse(record);
}

/**
 * Safe version that returns null on validation failure.
 * Use when processing batches where individual failures should be skipped.
 */
export function safeConvertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval | null {
  const result = observationForEvalSchema.safeParse(record);
  return result.success ? result.data : null;
}
