"use client";

import { useTranslation } from "react-i18next";
import { changeLanguage } from "@/src/i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { supportedLanguages } from "@/src/i18n";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [currentLanguage, setCurrentLanguage] = useState<string>("en-US");

  useEffect(() => {
    setCurrentLanguage(i18n.language || "en-US");
  }, [i18n.language]);

  const handleLanguageChange = async (
    language: string,
    event?: React.MouseEvent | React.KeyboardEvent,
  ) => {
    if (event) {
      event.stopPropagation();
    }
    try {
      await changeLanguage(language);
      setCurrentLanguage(language);
    } catch (error) {
      console.error("Failed to change language:", error);
    }
  };

  const currentLang =
    supportedLanguages.find((lang) => lang.code === currentLanguage) ||
    supportedLanguages[0];

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          document.body.style.pointerEvents = "";
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <div className="flex w-full items-center py-0.5 text-sm">
          <span className="mr-4">{t("ui.layout.navigation.language")}</span>
          <div className="flex items-center space-x-2">
            <span>{currentLang.name}</span>
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48" align="start">
        {supportedLanguages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={(event) => handleLanguageChange(lang.code, event)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <span>{lang.name}</span>
            </div>
            {currentLanguage === lang.code && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
