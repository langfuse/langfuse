import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";
import * as z from "zod";

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

export const nameSchema = StringNoHTMLNonEmpty.max(
  100,
  "Name must be at most 100 characters",
)
  .transform((value) => value.normalize("NFC").replace(/[\u2018\u2019]/g, "'"))
  .refine((value) => noUrlCheck(value), {
    message: "Input should not contain a URL",
  })
  .refine((value) => /^\p{L}[\p{L}\p{M}\p{N}\s.'\-]*$/u.test(value), {
    message:
      "Name must start with a letter and can only contain letters, numbers, spaces, hyphens, apostrophes, and periods",
  });

export const signupSchema = z.object({
  name: nameSchema,
  email: z.string().email(),
  password: passwordSchema,
  referralSource: z.string().optional(),
});
