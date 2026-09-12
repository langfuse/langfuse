// @vitest-environment jsdom

import { collapsedForSearch } from "./searchMatches";
import { type LayoutNode } from "./layout";

const node = (id: string, children: LayoutNode[] = []): LayoutNode => ({
  id,
  name: id,
  startTime: new Date("2026-01-01T00:00:00Z"),
  latency: 1,
  children,
});

// root
// |- a
// |  |- a1
// |  `- a2
// |     `- a2x
// `- b
const tree = [
  node("root", [node("a", [node("a1"), node("a2", [node("a2x")])]), node("b")]),
];

describe("collapsedForSearch", () => {
  it("opens the whole collapsed chain above a hit, and nothing else", () => {
    // "a" and "a2" both hide a2x, so both have to open or it still has no row.
    // "b" hides nothing that matched and stays as the user left it.
    expect(
      collapsedForSearch({
        roots: tree,
        collapsed: new Set(["a", "a2", "b"]),
        matchedIds: new Set(["a2x"]),
      }),
    ).toEqual(new Set(["b"]));
  });

  it("leaves a matched row's own subtree collapsed", () => {
    // "a" already has a row of its own; the query said nothing about its
    // children.
    expect(
      collapsedForSearch({
        roots: tree,
        collapsed: new Set(["a"]),
        matchedIds: new Set(["a"]),
      }),
    ).toEqual(new Set(["a"]));
  });

  it("returns the same set when no hit is hidden", () => {
    // Reference equality, not just contents: the row layout memoizes on it.
    const collapsed = new Set(["b"]);
    expect(
      collapsedForSearch({
        roots: tree,
        collapsed,
        matchedIds: new Set(["a1"]),
      }),
    ).toBe(collapsed);
  });

  it("returns the same set for a query that hit nothing", () => {
    const collapsed = new Set(["a"]);
    expect(
      collapsedForSearch({ roots: tree, collapsed, matchedIds: new Set() }),
    ).toBe(collapsed);
  });
});
