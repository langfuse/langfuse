import { noHtmlCheck } from "@langfuse/shared";
import * as z from "zod";

export const signupSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Name is required" })
    .refine((value) => noHtmlCheck(value), {
      message: "Input should not contain HTML",
    }),
  email: z.string().email(),
  password: z.string().min(8, {
    message: "Password must be at least 8 characters long",
  }),
  referralSource: z.string().optional(),
});
