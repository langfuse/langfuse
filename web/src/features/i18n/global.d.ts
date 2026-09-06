import type { AppLocale } from "@/src/features/i18n/config";
import type { AppMessages } from "@/src/features/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: AppMessages;
  }
}
