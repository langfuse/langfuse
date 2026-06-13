import { en } from "@/src/features/i18n/messages/en";
import { zhCN } from "@/src/features/i18n/messages/zh-CN";

export const defaultLocale = "en";
export const supportedLocales = ["en", "zh-CN"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof en;

export const messages: Record<
  SupportedLocale,
  Record<TranslationKey, string>
> = {
  en,
  "zh-CN": zhCN,
};

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return supportedLocales.includes(locale as SupportedLocale);
}
