// @vitest-environment jsdom

import { litRowIds } from "./searchMatches";
import { type LayoutNode } from "./layout";

const node = (id: string, children: LayoutNode[] = []): LayoutNode => ({
  id,
  name: id,
  startTime: new Date("2026-01-01T00:00:00Z"),
  latency: 1,
  children,
});

// root
// |- a (collapsed in some cases)
// |  |- a1
// |  `- a2
// |     `- a2x
// `- b
const tree = [
  node("root", [node("a", [node("a1"), node("a2", [node("a2x")])]), node("b")]),
];

describe("litRowIds", () => {
  it("lights the matching rows themselves when nothing is collapsed", () => {
    expect(
      litRowIds({
        roots: tree,
        collapsed: new Set(),
        matchedIds: new Set(["a1"]),
      }),
    ).toEqual(new Set(["a1"]));
  });

  it("does not light an expanded parent because a child matched", () => {
    // The child has its own row and says so itself.
    const lit = litRowIds({
      roots: tree,
      collapsed: new Set(),
      matchedIds: new Set(["a1"]),
    });
    expect(lit.has("a")).toBe(false);
    expect(lit.has("root")).toBe(false);
  });

  it("lifts a hidden match onto the collapsed row standing in for it", () => {
    // "a" is collapsed, so a1 has no row — without lifting, the query lights
    // nothing and the reveal has nowhere to scroll.
    expect(
      litRowIds({
        roots: tree,
        collapsed: new Set(["a"]),
        matchedIds: new Set(["a1"]),
      }),
    ).toEqual(new Set(["a"]));
  });

  it("lifts to the nearest VISIBLE collapsed ancestor, not every ancestor", () => {
    // Both "a" and "a2" are collapsed, but "a2" is itself hidden under "a";
    // only "a" has a row.
    expect(
      litRowIds({
        roots: tree,
        collapsed: new Set(["a", "a2"]),
        matchedIds: new Set(["a2x"]),
      }),
    ).toEqual(new Set(["a"]));
  });

  it("lights a collapsed row for its own match and for a hidden one alike", () => {
    expect(
      litRowIds({
        roots: tree,
        collapsed: new Set(["a"]),
        matchedIds: new Set(["a", "b"]),
      }),
    ).toEqual(new Set(["a", "b"]));
  });

  it("lights nothing when a live query hit nothing", () => {
    expect(
      litRowIds({
        roots: tree,
        collapsed: new Set(["a"]),
        matchedIds: new Set(),
      }),
    ).toEqual(new Set());
  });

  it("treats an absent collapsed set as nothing collapsed", () => {
    expect(litRowIds({ roots: tree, matchedIds: new Set(["a2x"]) })).toEqual(
      new Set(["a2x"]),
    );
  });
});
