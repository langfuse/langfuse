import type { ReactElement, ReactNode } from "react";
import {
  render as testingLibraryRender,
  type RenderOptions,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import remainderUi from "@/src/features/i18n/messages/en/remainderUi.json";

function V4MigrationTestI18nProvider({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={{ remainderUi }}>
      {children}
    </NextIntlClientProvider>
  );
}

export function render(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return testingLibraryRender(ui, {
    ...options,
    wrapper: V4MigrationTestI18nProvider,
  });
}
