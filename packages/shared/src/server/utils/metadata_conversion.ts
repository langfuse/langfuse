import { parseJsonPrioritised } from "../../utils/json";
import { MetadataDomain } from "../../domain";

/**
 * Zips parallel ClickHouse array columns (`metadata_names`, `metadata_values`)
 * into a plain object. If a key appears more than once the **first** occurrence
 * wins, matching the ClickHouse `mapFromArrays(arrayReverse(...))` convention.
 *
 * Returns `undefined` when the names array is empty so callers can distinguish
 * "no metadata" from "empty metadata object".
 *
 * Collects into a `Map` so that keys shared with `Object.prototype`
 * (`toString`, `constructor`, `__proto__`, ...) are treated as ordinary
 * metadata keys rather than as already-present ones.
 */
export function metadataArraysToRecord(
  names: string[],
  values: string[],
): Record<string, string> | undefined {
  if (names.length === 0) return undefined;

  const record = new Map<string, string>();
  names.forEach((name, i) => {
    if (!record.has(name)) {
      record.set(name, values[i]);
    }
  });

  return Object.fromEntries(record);
}

export function parseMetadataCHRecordToDomain(
  metadata: Record<string, string>,
): MetadataDomain {
  return metadata
    ? Object.fromEntries(
        Object.entries(metadata ?? {}).map(([key, val]) => [
          key,
          val === null ? null : parseJsonPrioritised(val),
        ]),
      )
    : {};
}
