import { parseJsonPrioritised } from "../../utils/json";
import { JsonNested } from "../../utils/zod";
import { MetadataDomain } from "../../domain";

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

/**
 * Reverses flattenJsonToPathArrays: groups dot-notation keys by their first
 * segment back into nested objects. Only unflattens one level — the first dot
 * separates parent from child key (child may itself contain dots).
 *
 * Example: { "resourceAttributes.service.name": "svc" } → { resourceAttributes: { "service.name": "svc" } }
 *
 * Only used for events table metadata which uses flattenJsonToPathArrays on write.
 */
export function unflattenMetadata(flat: MetadataDomain): MetadataDomain {
  const result: MetadataDomain = {};

  for (const [key, value] of Object.entries(flat)) {
    const dotIndex = key.indexOf(".");
    if (dotIndex === -1) {
      result[key] = value;
    } else {
      const parent = key.slice(0, dotIndex);
      const child = key.slice(dotIndex + 1);
      if (result[parent] === undefined || typeof result[parent] !== "object") {
        result[parent] = {} as { [key: string]: JsonNested };
      }
      (result[parent] as { [key: string]: JsonNested })[child] =
        value as JsonNested;
    }
  }

  return result;
}
