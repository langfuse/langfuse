"use client";
import i18n from "i18next";
import { camelCase } from "lodash";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

export const supportedLanguages = [
  { code: "en-US", name: "English" },
  { code: "zh-Hans", name: "简体中文" },
];

const requireSilent = async (lang: string, namespace: string) => {
  let res;
  try {
    res = (await import(`./locales/${lang}/${namespace}`)).default;
  } catch {
    res = (await import(`./locales/en-US/${namespace}`)).default;
  }

  return res;
};

const getNamespaces = (): string[] => {
  const context = (require as any).context("./locales/en-US", false, /\.ts$/);
  return context
    .keys()
    .map((key: string) => key.replace("./", "").replace(".ts", ""));
};

const NAMESPACES = getNamespaces();

export const loadLangResources = async (lang: string) => {
  const modules = await Promise.all(
    NAMESPACES.map((ns: string) => requireSilent(lang, ns)),
  );
  const resources = modules.reduce(
    (acc: Record<string, any>, mod: any, index: number) => {
      acc[camelCase(NAMESPACES[index])] = mod;
      return acc;
    },
    {} as Record<string, any>,
  );
  return resources;
};

// Load en-US resources first to make sure fallback works
const getInitialTranslations = () => {
  const en_USResources = NAMESPACES.reduce(
    (acc: Record<string, any>, ns: string, index: number) => {
      acc[camelCase(NAMESPACES[index])] = require(
        `./locales/en-US/${ns}`,
      ).default;
      return acc;
    },
    {} as Record<string, any>,
  );
  return {
    "en-US": {
      translation: en_USResources,
    },
  };
};

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      lng: undefined,
      fallbackLng: "en-US",
      supportedLngs: supportedLanguages.map((lang) => lang.code),
      detection: {
        order: ["localStorage", "navigator", "htmlTag"],
        caches: ["localStorage"],
      },
      resources: getInitialTranslations(),
    });
}

export const changeLanguage = async (lng?: string) => {
  if (!lng) return;
  if (!i18n.hasResourceBundle(lng, "translation")) {
    const resource = await loadLangResources(lng);
    i18n.addResourceBundle(lng, "translation", resource, true, true);
  }
  await i18n.changeLanguage(lng);
};

export default i18n;
