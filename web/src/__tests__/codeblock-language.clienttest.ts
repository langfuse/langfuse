import { describe, expect, it } from "vitest";
import { normalizeCodeblockLanguage } from "@/src/utils/normalizeCodeblockLanguage";

describe("normalizeCodeblockLanguage", () => {
  it("preserves supported languages and aliases", () => {
    expect(normalizeCodeblockLanguage("typescript")).toBe("typescript");
    expect(normalizeCodeblockLanguage("PYTHON")).toBe("python");
    expect(normalizeCodeblockLanguage("shell")).toBe("shell");
    expect(normalizeCodeblockLanguage("markup")).toBe("markup");
    expect(normalizeCodeblockLanguage("tsx")).toBe("tsx");
  });

  it("falls back to plain text for unknown or missing language names", () => {
    expect(normalizeCodeblockLanguage("unknown-language")).toBe("text");
    expect(normalizeCodeblockLanguage("")).toBe("text");
  });
});
