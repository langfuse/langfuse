import type { ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { LanggraphMetadataSchema } from "../types";

export const isLanggraphTrace = (
  observations: ObservationReturnTypeWithMetadata[],
) => {
  return observations.some((o) => {
    let jsonParsedMetadata = o.metadata;

    try {
      jsonParsedMetadata =
        o.metadata && typeof o.metadata === "string"
          ? JSON.parse(o.metadata)
          : o.metadata;
    } catch {
      return false;
    }

    return LanggraphMetadataSchema.safeParse(jsonParsedMetadata).success;
  });
};
