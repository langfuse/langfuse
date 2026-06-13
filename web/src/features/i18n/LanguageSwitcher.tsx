import { useRouter } from "next/router";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  supportedLocales,
  type SupportedLocale,
} from "@/src/features/i18n/messages";
import { useI18n } from "@/src/features/i18n/I18nProvider";

export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useI18n();

  const onLocaleChange = (nextLocale: SupportedLocale) => {
    router
      .push(router.asPath, router.asPath, {
        locale: nextLocale,
        scroll: false,
      })
      .catch(() => undefined);
  };

  return (
    <Select value={locale} onValueChange={onLocaleChange}>
      <SelectTrigger aria-label={t("i18n.language")} className="w-[11rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {supportedLocales.map((supportedLocale) => (
          <SelectItem key={supportedLocale} value={supportedLocale}>
            {supportedLocale === "en"
              ? t("i18n.english")
              : t("i18n.chineseSimplified")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
