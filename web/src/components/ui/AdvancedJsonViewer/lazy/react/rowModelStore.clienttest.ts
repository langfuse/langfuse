/**
 * rowModelStore drives the async RowModel seam for the renderer. These tests
 * pin the observable contract the virtualized list depends on: laziness (cost
 * proportional to what's expanded, not to total size), expand/collapse row
 * counts, wide-container pagination + load-more, revision bumps on structural
 * change, and on-demand value materialization (LFE-11080).
 */
import { createRowModelStore } from "./rowModelStore";
import { PAGE_SIZE } from "../treeRowModel";
import type { JsonRow } from "../rowModel";

const visibleRows = (
  store: ReturnType<typeof createRowModelStore>,
): JsonRow[] => [...store.getState().rows.values()];

const findRow = (
  store: ReturnType<typeof createRowModelStore>,
  keyOrIndex: string | number,
): JsonRow | undefined =>
  visibleRows(store).find((r) => r.keyOrIndex === keyOrIndex);

describe("rowModelStore", () => {
  it("becomes ready and shows the root expanded one level", async () => {
    const store = createRowModelStore();
    await store.getState().init({ a: 1, b: [10, 20, 30] });

    expect(store.getState().status).toBe("ready");
    // root object + its two members (b is a collapsed array).
    expect(store.getState().totalVisible).toBe(3);

    const b = findRow(store, "b");
    expect(b?.type).toBe("array");
    expect(b?.expandable).toBe(true);
    expect(b?.expanded).toBe(false);
    // Note: a collapsed nested container's childCount may be unknown until it
    // is scanned (engine laziness), so we don't assert it here — see the
    // expand test, where the expanded array's elements are all visible.
  });

  it("is lazy: a 5000-element array shows one page + a load-more row, not 5000", async () => {
    const store = createRowModelStore();
    const big = Array.from({ length: 5000 }, (_, i) => i);
    await store.getState().init(big);

    // root array (expanded) + first PAGE_SIZE children + one load-more row.
    expect(store.getState().totalVisible).toBe(1 + PAGE_SIZE + 1);
    const rows = visibleRows(store);
    expect(rows[rows.length - 1]?.isLoadMore).toBe(true);
  });

  it("expand/collapse changes the visible count and bumps the revision", async () => {
    const store = createRowModelStore();
    await store.getState().init({ a: 1, b: [10, 20, 30] });
    const revBefore = store.getState().revision;

    const b = findRow(store, "b")!;
    await store.getState().toggle(b.nodeId, false); // expand
    expect(store.getState().totalVisible).toBe(6); // + 3 array elements
    expect(store.getState().revision).toBeGreaterThan(revBefore);
    // the three elements are now visible
    expect(visibleRows(store).filter((r) => r.type === "number")).toHaveLength(
      4, // a:1 plus 10,20,30
    );

    await store.getState().toggle(b.nodeId, true); // collapse
    expect(store.getState().totalVisible).toBe(3);
  });

  it("load-more reveals the next page and drops the load-more row when drained", async () => {
    const store = createRowModelStore();
    await store.getState().init(Array.from({ length: 150 }, (_, i) => i));

    // one page + load-more
    expect(store.getState().totalVisible).toBe(1 + PAGE_SIZE + 1);
    const loadMore = visibleRows(store).find((r) => r.isLoadMore)!;
    expect(loadMore).toBeDefined();

    await store.getState().loadMore(loadMore.nodeId);
    // all 150 now loaded, no more load-more row: root + 150.
    expect(store.getState().totalVisible).toBe(1 + 150);
    expect(visibleRows(store).some((r) => r.isLoadMore)).toBe(false);
  });

  it("materializes a leaf value on demand into the values cache", async () => {
    const store = createRowModelStore();
    await store.getState().init({ greeting: "hello world" });

    const leaf = findRow(store, "greeting")!;
    expect(store.getState().values.has(leaf.nodeId)).toBe(false);

    await store.getState().materialize(leaf.nodeId);
    const result = store.getState().values.get(leaf.nodeId);
    expect(result?.ok).toBe(true);
    if (result?.ok) expect(result.value.value).toBe("hello world");
  });

  it("abandons in-flight work after dispose (no state churn)", async () => {
    const store = createRowModelStore();
    await store.getState().init({ a: 1 });
    const revBefore = store.getState().revision;

    store.getState().dispose();
    // A toggle after dispose must no-op (model released, generation bumped).
    const a = { nodeId: 0, expanded: false } as JsonRow;
    await store.getState().toggle(a.nodeId, false);
    expect(store.getState().revision).toBe(revBefore);
  });
});
