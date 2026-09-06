import { useRouter } from "next/router";

import {
  getAppLocale,
  getLocaleCookie,
  type AppLocale,
} from "@/src/features/i18n/config";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export function useLanguageSwitcher() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const locale = getAppLocale(router.locale);

  const selectLocale = (nextLocale: AppLocale) => {
    if (nextLocale === locale) return;

    document.cookie = getLocaleCookie(nextLocale);
    capture("user_settings:language_changed", { locale: nextLocale });
    router
      .push({ pathname: router.pathname, query: router.query }, router.asPath, {
        locale: nextLocale,
      })
      .catch(() => undefined);
  };

  return { locale, selectLocale };
}
