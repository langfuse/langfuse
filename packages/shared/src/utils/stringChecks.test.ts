import { describe, expect, it } from "vitest";

import { truncate } from "./stringChecks";

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return true;
    }
  }
  return false;
}

describe("truncate", () => {
  it("returns the string unchanged when at or under the limit", () => {
    expect(truncate("hello", 16)).toBe("hello");
    expect(truncate("exactly-sixteen!", 16)).toBe("exactly-sixteen!");
  });

  it("appends an ellipsis when over the limit", () => {
    expect(truncate("this is definitely longer than sixteen", 16)).toBe(
      "this is definite...",
    );
  });

  it("counts code points, not UTF-16 code units, for the limit", () => {
    expect(truncate("🎉".repeat(8), 16)).toBe("🎉".repeat(8));
  });

  it("does not split surrogate pairs when the cut lands mid-pair", () => {
    const input = "a" + "🎉".repeat(20);
    const out = truncate(input, 16);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out).toBe("a" + "🎉".repeat(15) + "...");
  });

  it("keeps astral characters intact for realistic model names", () => {
    const input = "gpt-4o-" + "🚀".repeat(30) + "-preview";
    const out = truncate(input, 30);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out.endsWith("...")).toBe(true);
  });

  it("handles mathematical alphanumeric (astral) code points", () => {
    const input = "𝟙𝟚𝟛𝟜𝟝𝟞𝟟𝟠𝟡";
    const out = truncate(input, 5);
    expect(hasLoneSurrogate(out)).toBe(false);
    expect(out).toBe("𝟙𝟚𝟛𝟜𝟝...");
  });

  it("leaves BMP (non-astral) strings such as CJK unaffected", () => {
    expect(truncate("你好世界你好世界", 5)).toBe("你好世界你...");
  });
});