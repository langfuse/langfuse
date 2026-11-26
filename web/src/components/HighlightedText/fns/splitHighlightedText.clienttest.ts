import { describe, expect, it } from "vitest";
import { splitHighlightedText } from "./splitHighlightedText";

describe("splitHighlightedText", () => {
  it("matches case-insensitively and preserves original text", () => {
    expect(splitHighlightedText("One TWO two!", "two")).toEqual([
      { text: "One ", isMatch: false },
      { text: "TWO", isMatch: true },
      { text: " ", isMatch: false },
      { text: "two", isMatch: true },
      { text: "!", isMatch: false },
    ]);
  });

  it("treats regex metacharacters as literal text", () => {
    expect(splitHighlightedText("a [b]+ c", "[b]+")).toEqual([
      { text: "a ", isMatch: false },
      { text: "[b]+", isMatch: true },
      { text: " c", isMatch: false },
    ]);
  });

  it("preserves original offsets when lowercasing expands a character", () => {
    expect(splitHighlightedText("İ hello", "hello")).toEqual([
      { text: "İ ", isMatch: false },
      { text: "hello", isMatch: true },
      { text: "", isMatch: false },
    ]);
  });

  it("highlights İstanbul when searching for i, matching the search filter", () => {
    const text = "İstanbul";
    const query = "i";

    expect(text.toLowerCase().includes(query.toLowerCase())).toBe(true);
    expect(splitHighlightedText(text, query)).toEqual([
      { text: "", isMatch: false },
      { text: "İ", isMatch: true },
      { text: "stanbul", isMatch: false },
    ]);
  });

  it.each([
    ["hello", ""],
    ["hello", "absent"],
    ["", "query"],
  ])("leaves %j unchanged for query %j", (text, query) => {
    expect(splitHighlightedText(text, query)).toEqual([
      { text, isMatch: false },
    ]);
  });
});
