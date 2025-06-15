import * as z from "zod/v4";

export const projectRetentionSchema = z.object({
  retention: z.coerce
    .number()
    .int("Must be an integer")
    .refine((value) => value === 0 || value >= 3, {
      message: "Value must be 0 or at least 3 days",
    }),
});
