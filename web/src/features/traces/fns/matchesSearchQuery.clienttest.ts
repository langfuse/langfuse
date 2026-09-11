// @vitest-environment jsdom

import { matchesSearchQuery, type SearchableNode } from "./matchesSearchQuery";

const node = (over: Partial<SearchableNode> = {}): SearchableNode => ({
  id: "obs-a1b2",
  name: "classify intent",
  type: "GENERATION",
  ...over,
});

describe("matchesSearchQuery", () => {
  it("matches a substring of the name, case-insensitively", () => {
    expect(matchesSearchQuery(node(), "classify")).toBe(true);
    expect(matchesSearchQuery(node(), "CLASSIFY")).toBe(true);
    expect(matchesSearchQuery(node(), "fy int")).toBe(true);
  });

  it("matches the type and the id too", () => {
    expect(matchesSearchQuery(node(), "generation")).toBe(true);
    expect(matchesSearchQuery(node(), "a1b2")).toBe(true);
  });

  it("misses when the query is nowhere in type, name or id", () => {
    expect(matchesSearchQuery(node(), "zzz")).toBe(false);
  });

  it("treats an empty or whitespace-only query as no search at all", () => {
    // Not match-everything: the callers show the unfiltered view instead.
    expect(matchesSearchQuery(node(), "")).toBe(false);
    expect(matchesSearchQuery(node(), "   ")).toBe(false);
  });

  it("ignores padding around a real query", () => {
    // A trailing space is a keystroke on the way to the next word.
    expect(matchesSearchQuery(node(), "  classify ")).toBe(true);
  });

  it("does not search anything beyond type, name and id", () => {
    // The panel shows these three; a match on something invisible would read as
    // a false positive.
    expect(
      matchesSearchQuery(node({ name: "step", id: "x", type: "SPAN" }), "step"),
    ).toBe(true);
    expect(
      matchesSearchQuery(node({ name: "step", id: "x", type: "SPAN" }), "1.2s"),
    ).toBe(false);
  });
});
