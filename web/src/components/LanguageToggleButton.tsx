import React from "react";
import { Button } from "@/src/components/ui/button";
import { useI18n } from "@/src/hooks/useI18n";
import { Globe } from "lucide-react";

export const LanguageToggleButton: React.FC = () => {
  const { currentLanguage, changeLanguage, t } = useI18n();

  const nextLocale = currentLanguage === "zh" ? "en" : "zh";
  const label = currentLanguage === "zh" ? "EN" : "中文";

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => changeLanguage(nextLocale)}
      aria-label={t("language.switch")}
      className="gap-2 px-2"
    >
      <Globe className="h-4 w-4" />
      {label}
    </Button>
  );
};

export default LanguageToggleButton;
