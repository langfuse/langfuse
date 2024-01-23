import { noHtmlRegex } from "@/src/features/auth/lib/signupSchema";
import * as z from "zod";

export const projectNameSchema = z.object({
  name: z
    .string()
    .min(3, "Must have at least 3 characters")
    .refine((value) => !noHtmlRegex.test(value), {
      message: "Input should not contain HTML",
    }),
});
