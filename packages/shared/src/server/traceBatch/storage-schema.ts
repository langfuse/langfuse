import { z } from "zod";

/** Read before the full schema so a newer version is distinguishable from invalid data. */
export const traceBatchInputsVersionSchema = z.object({
  schemaVersion: z.number(),
});
