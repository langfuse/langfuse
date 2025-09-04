import React from "react";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { useI18n } from "@/src/hooks/useI18n";

export const LanguageSwitcher: React.FC = () => {
  const { t, changeLanguage, currentLanguage } = useI18n();

  const languages = [
    { code: "en", name: t("language.en"), flag: "🇺🇸" },
    { code: "zh", name: t("language.zh"), flag: "🇨🇳" },
  ];

  return (
    <>
      {languages.map((language) => (
        <DropdownMenuItem
          key={language.code}
          onClick={() => changeLanguage(language.code)}
          className={`flex items-center gap-2 ${
            currentLanguage === language.code ? "bg-accent" : ""
          }`}
        >
          <span>{language.flag}</span>
          <span>{language.name}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
};
