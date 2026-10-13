import { PreparedEvent } from "@langfuse/native";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";

/**
 * Snapshot a row after overflow handling and byte accounting into Rust. Serialize model parameters
 * for their ClickHouse String column; keep the caller's structured row available for evaluations.
 */
export function prepareNativeEvent(
  record: Omit<EventRecordInsertType, "model_parameters"> & {
    model_parameters?: unknown;
  },
): PreparedEvent {
  return new PreparedEvent({
    ...record,
    model_parameters:
      record.model_parameters == null ||
      typeof record.model_parameters === "string"
        ? record.model_parameters
        : JSON.stringify(record.model_parameters),
  });
}
