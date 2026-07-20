/**
 * The in-memory ChildProvider is the lazy seam for the JSON tree (LFE-11080):
 * it must return only the requested window of a container's immediate children
 * — never materialize a whole wide container, never recurse past the immediate
 * level — so the same contract can later be served by a byte-index Worker.
 */
import { describe, it, expect } from "vitest";
import { createInMemoryChildProvider, CHILD_PAGE_SIZE } from "./childProvider";

const provider = createInMemoryChildProvider();

describe("in-memory ChildProvider", () => {
  it("returns object children as a page with keys, types, and shallow child counts", () => {
    const page = provider.getChildPage(
      { a: 1, b: { x: 1, y: 2 }, c: [1, 2, 3] },
      0,
      0,
    );
    expect(page.total).toBe(3);
    expect(page.hasMore).toBe(false);
    expect(page.children.map((c) => c.key)).toEqual(["a", "b", "c"]);

    const [a, b, c] = page.children;
    expect(a).toMatchObject({
      type: "number",
      isExpandable: false,
      childCount: 0,
    });
    // Shallow peek: b's childCount is its OWN immediate children, not recursed.
    expect(b).toMatchObject({
      type: "object",
      isExpandable: true,
      childCount: 2,
    });
    expect(c).toMatchObject({
      type: "array",
      isExpandable: true,
      childCount: 3,
    });
  });

  it("returns array children with numeric keys", () => {
    const page = provider.getChildPage(["x", "y"], 0, 0);
    expect(page.total).toBe(2);
    expect(page.children.map((c) => c.key)).toEqual([0, 1]);
    expect(page.children[0]).toMatchObject({ value: "x", type: "string" });
  });

  it("paginates: a window returns only [offset, offset+limit) and reports hasMore", () => {
    const arr = Array.from({ length: 250 }, (_, i) => i);
    const first = provider.getChildPage(arr, 0, 100);
    expect(first.children).toHaveLength(100);
    expect(first.children[0]!.key).toBe(0);
    expect(first.total).toBe(250);
    expect(first.hasMore).toBe(true);

    const last = provider.getChildPage(arr, 200, 100);
    expect(last.children).toHaveLength(50);
    expect(last.children[0]!.key).toBe(200);
    expect(last.hasMore).toBe(false);
  });

  it("does NOT materialize a wide container — only the requested page", () => {
    const wide = Array.from({ length: 1_000_000 }, (_, i) => i);
    const page = provider.getChildPage(wide, 0, CHILD_PAGE_SIZE);
    // The 1M-element array exists (it's the input), but the provider must only
    // produce CHILD_PAGE_SIZE descriptors — never one per element.
    expect(page.children).toHaveLength(CHILD_PAGE_SIZE);
    expect(page.total).toBe(1_000_000);
    expect(page.hasMore).toBe(true);
  });

  it("falls back to the default page size when limit <= 0", () => {
    const arr = Array.from({ length: CHILD_PAGE_SIZE + 50 }, (_, i) => i);
    expect(provider.getChildPage(arr, 0, 0).children).toHaveLength(
      CHILD_PAGE_SIZE,
    );
    expect(provider.getChildPage(arr, 0, -5).children).toHaveLength(
      CHILD_PAGE_SIZE,
    );
  });

  it("returns an empty page for non-expandable values", () => {
    for (const v of ["str", 42, true, null, undefined]) {
      const page = provider.getChildPage(v, 0, 0);
      expect(page).toMatchObject({ children: [], total: 0, hasMore: false });
    }
  });
});
