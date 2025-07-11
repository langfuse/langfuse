import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";
import * as z from "zod/v4";

export const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters long." })
  .regex(/[A-Za-z]/, {
    message:
      "Please choose a secure password by combining letters, numbers, and special characters.",
  })
  .regex(/[0-9]/, {
    message:
      "Please choose a secure password by combining letters, numbers, and special characters.",
  })
  .regex(/[^A-Za-z0-9]/, {
    message:
      "Please choose a secure password by combining letters, numbers, and special characters.",
  });

export const signupSchema = z.object({
  name: StringNoHTMLNonEmpty.refine((value) => noUrlCheck(value), {
    message: "Input should not contain a URL",
  }),
  email: z.string().email(),
  password: passwordSchema,
  referralSource: z.string().optional(),
});
