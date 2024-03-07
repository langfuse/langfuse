import { z } from "zod";

export const SelectColumn = z.object({
  include: z.array(z.string()),
});
