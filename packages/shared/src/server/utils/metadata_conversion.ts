import { Prisma } from "@prisma/client";
import { parseJsonPrioritised } from "../../utils/json";

export function parseMetadataCHRecordToDomain(
  metadata: Record<string, string>,
): Prisma.JsonValue | null | undefined {
  return (
    metadata &&
    Object.fromEntries(
      Object.entries(metadata ?? {}).map(([key, val]) => [
        key,
        val && parseJsonPrioritised(val),
      ]),
    )
  );
}

export function parseMetadataDomainToCHRecord(
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, string> {
  if (metadata == null || metadata === "") {
    return {};
  }

  // If metadata is an object, we can just stringify the values, otherwise we need to take the value and stringify it as { metadata: "value" }
  if (typeof metadata === "object") {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, val]) => [key, JSON.stringify(val)]),
    );
  }

  return { metadata: JSON.stringify(metadata) };
}
