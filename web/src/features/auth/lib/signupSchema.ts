import { noUrlCheck, StringNoHTMLNonEmpty } from "@langfuse/shared";
import * as z from "zod/v4";

export const createPasswordSchema = (t: (key: string) => string) =>
  z
    .string()
    .min(8, { message: t("auth.passwordMinLength") })
    .regex(/[A-Za-z]/, {
      message: t("auth.pleaseChooseSecurePassword"),
    })
    .regex(/[0-9]/, {
      message: t("auth.pleaseChooseSecurePassword"),
    })
    .regex(/[^A-Za-z0-9]/, {
      message: t("auth.pleaseChooseSecurePassword"),
    });

export const createSignupSchema = (t: (key: string) => string) =>
  z.object({
    name: StringNoHTMLNonEmpty.refine((value) => noUrlCheck(value), {
      message: t("auth.inputShouldNotContainURL"),
    }),
    email: z.string().email({ message: t("auth.invalidEmailAddress") }),
    password: createPasswordSchema(t),
    referralSource: z.string().optional(),
  });

// 保持向后兼容性的默认导出
export const passwordSchema = createPasswordSchema(
  () => "Password must be at least 8 characters long.",
);
export const signupSchema = createSignupSchema(
  () => "Input should not contain a URL",
);
