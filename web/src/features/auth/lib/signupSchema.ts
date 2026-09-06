import { noUrlCheck, StringNoHTML } from "@langfuse/shared";
import * as z from "zod";

type SignupValidationMessages = {
  passwordMin: string;
  passwordSecure: string;
  nameMaxLength: string;
  nameRequired: string;
  nameNoHtml: string;
  nameNoUrl: string;
  nameFormat: string;
  invalidEmail?: string;
};

export const createPasswordSchema = ({
  passwordMin,
  passwordSecure,
}: Pick<SignupValidationMessages, "passwordMin" | "passwordSecure">) =>
  z
    .string()
    .min(8, { message: passwordMin })
    .regex(/[A-Za-z]/, {
      message: passwordSecure,
    })
    .regex(/[0-9]/, {
      message: passwordSecure,
    })
    .regex(/[^A-Za-z0-9]/, {
      message: passwordSecure,
    });

export const createNameSchema = ({
  nameMaxLength,
  nameRequired,
  nameNoHtml,
  nameNoUrl,
  nameFormat,
}: Pick<
  SignupValidationMessages,
  "nameMaxLength" | "nameRequired" | "nameNoHtml" | "nameNoUrl" | "nameFormat"
>) =>
  z
    .string()
    .min(1, nameRequired)
    .refine((value) => StringNoHTML.safeParse(value).success, {
      message: nameNoHtml,
    })
    .max(100, nameMaxLength)
    .transform((value) =>
      value.normalize("NFC").replace(/[\u2018\u2019]/g, "'"),
    )
    .refine((value) => noUrlCheck(value), {
      message: nameNoUrl,
    })
    .refine((value) => /^\p{L}[\p{L}\p{M}\p{N}\s.'\-]*$/u.test(value), {
      message: nameFormat,
    });

export const createSignupSchema = (messages: SignupValidationMessages) =>
  z.object({
    name: createNameSchema(messages),
    email: z.email(
      messages.invalidEmail ? { error: messages.invalidEmail } : undefined,
    ),
    password: createPasswordSchema(messages),
    referralSource: z.string().optional(),
  });

const defaultMessages: SignupValidationMessages = {
  passwordMin: "Password must be at least 8 characters long.",
  passwordSecure:
    "Please choose a secure password by combining letters, numbers, and special characters.",
  nameMaxLength: "Name must be at most 100 characters",
  nameRequired: "Text cannot be empty",
  nameNoHtml: "Text cannot contain HTML tags",
  nameNoUrl: "Input should not contain a URL",
  nameFormat:
    "Name must start with a letter and can only contain letters, numbers, spaces, hyphens, apostrophes, and periods",
};

export const passwordSchema = createPasswordSchema(defaultMessages);
export const signupSchema = createSignupSchema(defaultMessages);
