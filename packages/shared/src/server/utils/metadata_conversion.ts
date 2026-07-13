import { parseJsonPrioritised } from "../../utils/json";
import { MetadataDomain } from "../../domain";

/**
 * Zips parallel ClickHouse array columns (`metadata_names`, `metadata_values`)
 * into a plain object. If a key appears more than once the **first** occurrence
 * wins, matching the ClickHouse `mapFromArrays(arrayReverse(...))` convention.
 *
 * Returns `undefined` when the names array is empty so callers can distinguish
 * "no metadata" from "empty metadata object".
 */
export function metadataArraysToRecord(
  names: string[],
  values: string[],
): Record<string, string> | undefined {
  if (names.length === 0) return undefined;

  return names.reduce<Record<string, string>>((acc, name, i) => {
    if (!(name in acc)) {
      acc[name] = values[i];
    }
    return acc;
  }, {});
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
