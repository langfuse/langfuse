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
