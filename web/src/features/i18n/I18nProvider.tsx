import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { useRouter } from "next/router";
import {
  defaultLocale,
  isSupportedLocale,
  messages,
  type SupportedLocale,
  type TranslationKey,
} from "@/src/features/i18n/messages";

type I18nContextValue = {
  locale: SupportedLocale;
  t: (key: TranslationKey) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const locale =
    router.locale && isSupportedLocale(router.locale)
      ? router.locale
      : defaultLocale;

  const t = useCallback(
    (key: TranslationKey) =>
      messages[locale][key] ?? messages[defaultLocale][key],
    [locale],
  );

  const value = useMemo(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
}
