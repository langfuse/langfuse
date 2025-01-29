import { noHtmlCheck } from "@langfuse/shared";
import * as z from "zod";

export const projectNameSchema = z.object({
  name: z
    .string()
    .min(3, "Must have at least 3 characters")
    .max(30, "Must have at most 30 characters")
    .refine((value) => noHtmlCheck(value), {
      message: "Input should not contain HTML",
    }),
});
