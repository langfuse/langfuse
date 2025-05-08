import type { ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { LanggraphMetadataSchema } from "../types";

export const isLanggraphTrace = (
  observations: ObservationReturnTypeWithMetadata[],
) => {
  return observations.some(
    (o) =>
      LanggraphMetadataSchema.safeParse(
        o.metadata ? JSON.parse(o.metadata) : undefined,
      ).success,
  );
};
