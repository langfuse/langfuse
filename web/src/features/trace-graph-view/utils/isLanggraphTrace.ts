import type { ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { LanggraphMetadataSchema } from "../types";

export const isLanggraphTrace = (
  observations: ObservationReturnTypeWithMetadata[],
) => {
  return observations.some((o) => {
    let metadata = o.metadata;

    if (metadata && typeof metadata == "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {}
    }

    return LanggraphMetadataSchema.safeParse(metadata).success;
  });
};
