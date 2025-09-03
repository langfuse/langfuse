import { useTranslation } from "next-i18next";
import { useRouter } from "next/router";

export const useI18n = () => {
  const { t, i18n } = useTranslation("common");
  const router = useRouter();

  const changeLanguage = (locale: string) => {
    const { pathname, asPath, query } = router;
    router.push({ pathname, query }, asPath, { locale });
  };

  const currentLanguage = i18n.language;

  return {
    t,
    changeLanguage,
    currentLanguage,
    isEnglish: currentLanguage === "en",
    isChinese: currentLanguage === "zh",
  };
};
