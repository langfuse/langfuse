import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { createTranslator, useTranslations } from "next-intl";
import englishMessages from "@/src/features/i18n/messages/en/sharedUi.json";

type TranslationValues = Record<string, string | number | Date>;
type SharedUiTranslator = (key: string, values?: TranslationValues) => string;

const englishTranslator = createTranslator({
  locale: "en",
  messages: englishMessages,
});

const SharedUiTranslationContext = createContext<SharedUiTranslator>(
  (key, values) => englishTranslator(key as never, values as never),
);

export function SharedUiProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("sharedUi");
  const translate = useCallback<SharedUiTranslator>(
    (key, values) => t(key as never, values as never),
    [t],
  );

  return (
    <SharedUiTranslationContext.Provider value={translate}>
      {children}
    </SharedUiTranslationContext.Provider>
  );
}

export function useSharedUiTranslations(namespace: string) {
  const translate = useContext(SharedUiTranslationContext);

  return useMemo<SharedUiTranslator>(
    () => (key, values) => translate(`${namespace}.${key}`, values),
    [namespace, translate],
  );
}
