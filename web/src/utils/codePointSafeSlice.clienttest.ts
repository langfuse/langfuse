import { describe, expect, it } from "vitest";

import { codePointSafeSlice } from "@/src/utils/codePointSafeSlice";

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

describe("codePointSafeSlice", () => {
  it("drops a high surrogate at the boundary", () => {
    const value = "a".repeat(1999) + "🚀" + "tail";
    const sliced = codePointSafeSlice(value, 2000);
    expect(sliced).toBe("a".repeat(1999));
    expect(
      sliced.charCodeAt(sliced.length - 1) >= HIGH_SURROGATE_MIN &&
        sliced.charCodeAt(sliced.length - 1) <= HIGH_SURROGATE_MAX,
    ).toBe(false);
  });

  it("keeps a surrogate pair that fits", () => {
    const value = "a".repeat(1998) + "🚀tail";
    expect(codePointSafeSlice(value, 2000)).toBe(
      "a".repeat(1998) + "🚀",
    );
  });


  it("leaves room for ValueCell to append an ellipsis", () => {
    const value = "a".repeat(1999) + "🚀" + "tail";
    expect(codePointSafeSlice(value, 2000) + "...").toBe(
      "a".repeat(1999) + "...",
    );
  });

  it("returns short values unchanged", () => {
    expect(codePointSafeSlice("short", 2000)).toBe("short");
  });
});
