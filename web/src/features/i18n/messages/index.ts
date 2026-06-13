import { en } from "@/src/features/i18n/messages/en";
import { zhCN } from "@/src/features/i18n/messages/zh-CN";

export const defaultLocale = "en";
export const supportedLocales = ["en", "zh-CN"] as const;

export type SupportedLocale = (typeof supportedLocales)[number];
export type TranslationKey = keyof typeof en;
export type TranslationValues = Record<string, number | string>;

export const localeMetadata: Record<
  SupportedLocale,
  { labelKey: TranslationKey }
> = {
  en: {
    labelKey: "i18n.english",
  },
  "zh-CN": {
    labelKey: "i18n.chineseSimplified",
  },
};

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

export function formatMessage(
  message: string,
  values?: TranslationValues,
): string {
  if (!values) return message;

  return message.replace(/\{(\w+)\}/g, (placeholder, key) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : placeholder,
  );
}
