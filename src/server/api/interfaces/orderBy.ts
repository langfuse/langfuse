import { z } from "zod";

export const orderBy = z
  .object({
    column: z.string(),
    order: z.enum(["ASC", "DESC"]),
  })
  .nullable();
