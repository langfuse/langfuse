import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type AppLocale,
} from "@/src/features/i18n/config";
import { useLanguageSwitcher } from "@/src/features/i18n/useLanguageSwitcher";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";

export function AuthLanguageSwitcher() {
  const t = useTranslations("auth.common");
  const { locale, selectLocale } = useLanguageSwitcher();

  return (
    <div className="fixed top-4 right-4 z-20 w-36">
      <Select
        value={locale}
        onValueChange={(value) => selectLocale(value as AppLocale)}
      >
        <SelectTrigger aria-label={t("language")}>
          <Languages className="mr-2 h-4 w-4" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {SUPPORTED_LOCALES.map((supportedLocale) => (
            <SelectItem key={supportedLocale} value={supportedLocale}>
              {LOCALE_LABELS[supportedLocale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
