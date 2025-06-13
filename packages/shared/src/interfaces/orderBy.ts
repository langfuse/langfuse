import { z } from "zod/v4";

export const orderBy = z
  .object({
    column: z.string(),
    order: z.enum(["ASC", "DESC"]),
  })
  .nullable();

export type OrderByState = z.infer<typeof orderBy>;
