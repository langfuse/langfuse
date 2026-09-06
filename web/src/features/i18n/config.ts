export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
export const DEFAULT_TIME_ZONE = "UTC";
export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";
export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: "English",
  "zh-CN": "简体中文",
};

const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function getAppLocale(locale: string | undefined): AppLocale {
  return SUPPORTED_LOCALES.includes(locale as AppLocale)
    ? (locale as AppLocale)
    : DEFAULT_LOCALE;
}

export function getLocaleCookie(locale: AppLocale): string {
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}
