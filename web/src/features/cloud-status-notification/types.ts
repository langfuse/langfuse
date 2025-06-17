import { z } from "zod/v4";

export const CloudStatus = z
  .enum(["operational", "downtime", "degraded", "maintenance"])
  .nullable();

export type CloudStatus = z.infer<typeof CloudStatus>;
