import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";

import { getMessages } from "@/src/features/i18n/messages";
import type { AppLocale } from "@/src/features/i18n/config";

export const renderMonitorWithIntl = (
  ui: ReactElement,
  locale: AppLocale = "en",
): RenderResult =>
  render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <NextIntlClientProvider locale={locale} messages={getMessages(locale)}>
        {children}
      </NextIntlClientProvider>
    ),
  });
