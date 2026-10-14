// @vitest-environment jsdom

import { matchesSearchQuery, type SearchableNode } from "./matchesSearchQuery";

const node: SearchableNode = {
  id: "obs-a1b2",
  name: "classify intent",
  type: "GENERATION",
};

describe("matchesSearchQuery", () => {
  it("matches a case-insensitive substring of type, name or id", () => {
    expect(matchesSearchQuery(node, "CLASSIFY")).toBe(true);
    expect(matchesSearchQuery(node, "generation")).toBe(true);
    expect(matchesSearchQuery(node, "a1b2")).toBe(true);
    expect(matchesSearchQuery(node, "zzz")).toBe(false);
  });

  it("treats a blank query as no search at all", () => {
    // Not match-everything: the callers show their unfiltered view instead.
    expect(matchesSearchQuery(node, "")).toBe(false);
    expect(matchesSearchQuery(node, "   ")).toBe(false);
  });

  it("ignores padding around a real query", () => {
    // A trailing space is a keystroke on the way to the next word.
    expect(matchesSearchQuery(node, "  classify ")).toBe(true);
  });
});
