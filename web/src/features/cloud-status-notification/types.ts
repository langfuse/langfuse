import { z } from "zod";

export const CloudStatus = z
  .enum(["operational", "downtime", "degraded", "maintenance"])
  .nullable();

export type CloudStatus = z.infer<typeof CloudStatus>;
