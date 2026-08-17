import type { EventRecordBaseType } from "../../../repositories/definitions";
import { metadataArraysToRecord } from "../../../utils/metadata_conversion";
import type { SpanIO } from "../types";

/**
 * ClickHouse event record -> SpanIO. Input/output are already string columns
 * (parsed lazily by the core parser's JSON-string boundary handling);
 * metadata is stored as parallel `metadata_names`/`metadata_values` arrays
 * and needs zipping into an object first
 */
export function spanIOFromEventRecord(record: EventRecordBaseType): SpanIO {
  return {
    input: record.input ?? null,
    output: record.output ?? null,
    metadata:
      metadataArraysToRecord(record.metadata_names, record.metadata_values) ??
      null,
  };
}
