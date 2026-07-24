/**
 * rowModelStore drives the async RowModel seam for the renderer. These tests
 * pin the observable contract the virtualized list depends on: laziness (cost
 * proportional to what's expanded, not to total size), expand/collapse row
 * counts, wide-container pagination + load-more, revision bumps on structural
 * change, and on-demand value materialization (LFE-11080).
 */
import { createRowModelStore } from "./rowModelStore";
import { PAGE_SIZE } from "../treeRowModel";
import type { JsonRow, RowModel, RowWindow } from "../rowModel";

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

// The in-process source resolves in one microtask, so it can't express the
// async races the store must survive under a real Worker source. These use a
// controllable model injected via `buildModel` to force out-of-order responses
// and overlapping mutations.
function makeRow(index: number): JsonRow {
  return {
    nodeId: index,
    depth: 1,
    keyOrIndex: index,
    type: "number",
    preview: `row-${index}`,
    truncatedPreview: false,
    expandable: false,
    expanded: false,
  };
}

function makeControllableModel(total: number) {
  let revision = 0;
  let gated = false;
  const gatedCalls: Array<{ start: number; resolve: () => void }> = [];
  let expandActive = 0;
  let maxExpandConcurrency = 0;

  const model: RowModel = {
    getRevision: () => revision,
    getTotalVisible: () => total,
    getRows: (start, count) => {
      const rows: JsonRow[] = [];
      const n = Math.max(0, Math.min(count, total - start));
      for (let k = 0; k < n; k++) rows.push(makeRow(start + k));
      const win: RowWindow = { revision, rows };
      if (!gated) return Promise.resolve(win);
      return new Promise<RowWindow>((resolve) => {
        gatedCalls.push({ start, resolve: () => resolve(win) });
      });
    },
    expand: async () => {
      expandActive += 1;
      maxExpandConcurrency = Math.max(maxExpandConcurrency, expandActive);
      await Promise.resolve();
      revision += 1;
      expandActive -= 1;
    },
    collapse: async () => {
      revision += 1;
    },
    loadMore: async () => {
      revision += 1;
    },
    getValue: async (nodeId) => ({
      ok: true as const,
      value: {
        nodeId,
        type: "number" as const,
        value: nodeId,
        lossyNumber: false,
        truncated: false,
        byteLength: 1,
      },
    }),
  };

  return {
    model,
    gate: () => {
      gated = true;
    },
    resolveGated: (start: number) => {
      const i = gatedCalls.findIndex((c) => c.start === start);
      if (i >= 0) gatedCalls.splice(i, 1)[0]!.resolve();
    },
    getMaxExpandConcurrency: () => maxExpandConcurrency,
  };
}

describe("rowModelStore async correctness", () => {
  it("merges an out-of-order window at its OWN offset, not the latest requested", async () => {
    const fake = makeControllableModel(10_000);
    const store = createRowModelStore({ buildModel: async () => fake.model });
    await store.getState().init(null); // prefetches [0,200) while ungated

    fake.gate();
    // Two overlapping requests for uncached ranges; the second moves the shared
    // lastStart. Resolve the FIRST after the second was issued.
    const pA = store.getState().ensureRange(300, 100);
    const pB = store.getState().ensureRange(5000, 100);
    fake.resolveGated(300);
    fake.resolveGated(5000);
    await Promise.all([pA, pB]);

    expect(store.getState().rows.get(300)?.nodeId).toBe(300);
    expect(store.getState().rows.get(5000)?.nodeId).toBe(5000);
    // The 300-window must NOT have landed at index 5000.
    expect(store.getState().rows.get(5000)?.nodeId).not.toBe(300);
  });

  it("serializes concurrent structural mutations (no double-page)", async () => {
    const fake = makeControllableModel(10);
    const store = createRowModelStore({ buildModel: async () => fake.model });
    await store.getState().init(null);

    // Fire two expands without awaiting the first — unserialized, both would be
    // active at once (the reentrancy that double-pages children).
    const t1 = store.getState().toggle(0, false);
    const t2 = store.getState().toggle(1, false);
    await Promise.all([t1, t2]);

    expect(fake.getMaxExpandConcurrency()).toBe(1);
  });

  it("abandons a queued mutation across a document swap (stale nodeId not applied)", async () => {
    // nodeIds restart per engine, so a mutation queued against document A must
    // NOT run against document B after a swap — it would toggle an unrelated
    // node. The generation is captured at ENQUEUE time to catch this.
    const leaf = (over: Partial<RowModel>): RowModel => ({
      getRevision: () => 0,
      getTotalVisible: () => 2,
      getRows: async () => ({ revision: 0, rows: [makeRow(0)] }),
      expand: async () => {},
      collapse: async () => {},
      loadMore: async () => {},
      getValue: async () => ({
        ok: true as const,
        value: {
          nodeId: 0,
          type: "number" as const,
          value: 0,
          lossyNumber: false,
          truncated: false,
          byteLength: 1,
        },
      }),
      ...over,
    });

    let releaseM1!: () => void;
    const bExpand = vi.fn(async () => {});
    let call = 0;
    const store = createRowModelStore({
      buildModel: async () =>
        call++ === 0
          ? leaf({ expand: () => new Promise<void>((r) => (releaseM1 = r)) })
          : leaf({ expand: bExpand }),
    });
    await store.getState().init(null); // document A

    const m1 = store.getState().toggle(1, false); // holds the serialize queue
    // Let m1 actually start (call A.expand and suspend) BEFORE the swap —
    // otherwise init's synchronous gen bump would abandon m1 before it runs.
    await new Promise((r) => setTimeout(r, 0));
    const stale = store.getState().toggle(9, false); // queued behind m1, doc A
    await store.getState().init(null); // swap to document B (gen bumped)
    releaseM1(); // m1 resolves → the queued stale mutation runs
    await Promise.all([m1, stale]);

    // The stale toggle targeted doc A's node 9; it must be abandoned, never
    // applied to document B's engine.
    expect(bExpand).not.toHaveBeenCalled();
  });
});
