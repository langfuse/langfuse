import { describe, expect, it } from "vitest";
import { codePointSafeSlice } from "./codePointSafeSlice";

const rocket = "\u{1F680}";

describe("codePointSafeSlice", () => {
  it("backs off when the limit would split a surrogate pair", () => {
    const value = "a".repeat(1999) + rocket + "tail";

    expect(codePointSafeSlice(value, 2000)).toBe("a".repeat(1999));
  });

  it("keeps a complete surrogate pair when it fits", () => {
    expect(codePointSafeSlice(`a${rocket}tail`, 3)).toBe(`a${rocket}`);
  });

  it("returns the original value when it fits and handles empty limits", () => {
    expect(codePointSafeSlice(rocket, 2)).toBe(rocket);
    expect(codePointSafeSlice(rocket, 0)).toBe("");
    expect(codePointSafeSlice(rocket, -1)).toBe("");
  });
});
