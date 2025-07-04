import { parseJsonPrioritised } from "../../utils/json";
import { MetadataDomain } from "../../domain";
//FIXME: do deep optimization
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
