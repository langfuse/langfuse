import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  getAppLocale,
  SUPPORTED_LOCALES,
} from "@/src/features/i18n/config";
import { getMessages } from "@/src/features/i18n/messages";

const getLeafKeys = (value: Record<string, unknown>, prefix = ""): string[] =>
  Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    return typeof child === "object" && child !== null
      ? getLeafKeys(child as Record<string, unknown>, path)
      : [path];
  });

describe("i18n configuration", () => {
  it("supports English and Simplified Chinese with English as the fallback", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "zh-CN"]);
    expect(DEFAULT_LOCALE).toBe("en");
    expect(getAppLocale("zh-CN")).toBe("zh-CN");
    expect(getAppLocale("fr")).toBe("en");
    expect(getAppLocale(undefined)).toBe("en");
  });

  it("keeps every locale catalog structurally complete", () => {
    const englishKeys = getLeafKeys(getMessages("en")).sort();
    const chineseKeys = getLeafKeys(getMessages("zh-CN")).sort();

    expect(chineseKeys).toEqual(englishKeys);
  });
});
