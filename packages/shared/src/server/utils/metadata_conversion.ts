import { parseJsonPrioritised } from "../../utils/json";
import { MetadataDomain } from "../../domain";
import { type JsonValue } from "@prisma/client/runtime/library";

/**
 * Resolves dataset item metadata into a flat Record.
 */
export function resolveMetadata(
  metadata: JsonValue | null | undefined,
): Record<string, unknown> {
  if (metadata === null || metadata === undefined) return {};
  if (Array.isArray(metadata)) return { metadata };
  if (typeof metadata === "object") return metadata as Record<string, unknown>;
  return { metadata };
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
