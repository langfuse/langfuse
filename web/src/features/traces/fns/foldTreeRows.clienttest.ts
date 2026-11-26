import { flattenTree } from "./flattenTree";
import { foldTreeRows } from "./foldTreeRows";

type Node = { id: string; children: Node[] };

const node = (id: string, children: Node[] = []): Node => ({ id, children });

// root > [a > [a1, a2], b > [b1], c]
const rows = flattenTree(
  [
    node("root", [
      node("a", [node("a1"), node("a2")]),
      node("b", [node("b1")]),
      node("c"),
    ]),
  ],
  new Set(),
);

describe("foldTreeRows", () => {
  it("keeps the ancestors and the rows right after the target", () => {
    const fold = foldTreeRows(rows, (row) => row.id === "a2", 2);

    expect(fold?.targetId).toBe("a2");
    // Ancestors fade least; the trailing rows fade step by step. The earlier
    // sibling a1 and the later row c are folded away.
    expect([...(fold?.fadeSteps ?? [])]).toEqual([
      ["a", 0],
      ["root", 0],
      ["b", 0],
      ["b1", 1],
    ]);
  });

  it("returns null when the target has no row", () => {
    expect(foldTreeRows(rows, (row) => row.id === "missing", 2)).toBeNull();
  });
});
