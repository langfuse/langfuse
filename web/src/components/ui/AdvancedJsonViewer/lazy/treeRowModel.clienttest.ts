/**
 * TreeRowModel is the single flatten/expand/paginate implementation, driven here
 * over the real byte engine via `sourceFromValue` (stringify → UTF-8 → engine).
 * It must keep cost proportional to what is expanded/visible, page wide
 * containers, carry bounded previews, materialize values on demand, stamp reads
 * with a revision, and never throw from getValue (LFE-11080, Fable-hardened).
 */
import { describe, it, expect } from "vitest";
import { TreeRowModel, PAGE_SIZE } from "./treeRowModel";
import { sourceFromValue } from "./asyncJsonSource";

const model = (value: unknown) => TreeRowModel.create(sourceFromValue(value));
const allRows = async (m: TreeRowModel) =>
  (await m.getRows(0, m.getTotalVisible())).rows;
const keys = (rows: { keyOrIndex: string | number | null }[]) =>
  rows.map((r) => r.keyOrIndex);

describe("TreeRowModel over the byte engine", () => {
  it("expands only the root level; deeper containers stay collapsed", async () => {
    const m = await model({ a: 1, b: { deep: { deeper: 1 } }, c: [1, 2] });
    const rows = await allRows(m);
    expect(keys(rows)).toEqual([null, "a", "b", "c"]);
    expect(rows.find((r) => r.keyOrIndex === "b")).toMatchObject({
      expandable: true,
      expanded: false,
    });
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(false);
  });

  it("expand materializes only that container's immediate children", async () => {
    const m = await model({ b: { deep: { deeper: 1 } } });
    const bId = (await allRows(m)).find((r) => r.keyOrIndex === "b")!.nodeId;
    await m.expand(bId);
    const rows = await allRows(m);
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(true);
    expect(rows.some((r) => r.keyOrIndex === "deeper")).toBe(false);
  });

  it("collapse drops descendants; re-expand restores them (state preserved)", async () => {
    const m = await model({ b: { deep: { x: 1 } } });
    const bId = (await allRows(m)).find((r) => r.keyOrIndex === "b")!.nodeId;
    await m.expand(bId);
    const deepId = (await allRows(m)).find(
      (r) => r.keyOrIndex === "deep",
    )!.nodeId;
    await m.expand(deepId); // expand two levels
    expect((await allRows(m)).some((r) => r.keyOrIndex === "x")).toBe(true);

    await m.collapse(bId);
    expect(keys(await allRows(m))).toEqual([null, "b"]);

    await m.expand(bId); // re-expand: deep AND its expanded child x return
    const rows = await allRows(m);
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(true);
    expect(rows.some((r) => r.keyOrIndex === "x")).toBe(true);
  });

  it("does NOT scan a huge collapsed container", async () => {
    const huge = {
      messages: Array.from({ length: 100_000 }, () => ({ role: "user" })),
    };
    const m = await model(huge);
    expect(m.getTotalVisible()).toBe(2); // root + collapsed "messages"
  });

  it("paginates a wide container: first page + load-more, then the rest", async () => {
    const wide = {
      items: Array.from({ length: PAGE_SIZE + 50 }, (_, i) => i),
    };
    const m = await model(wide);
    const itemsId = (await allRows(m)).find(
      (r) => r.keyOrIndex === "items",
    )!.nodeId;

    await m.expand(itemsId);
    let rows = await allRows(m);
    expect(rows.filter((r) => typeof r.keyOrIndex === "number")).toHaveLength(
      PAGE_SIZE,
    );
    const loadMore = rows.find((r) => r.isLoadMore)!;
    expect(loadMore).toBeDefined();

    await m.loadMore(loadMore.nodeId);
    rows = await allRows(m);
    expect(rows.filter((r) => typeof r.keyOrIndex === "number")).toHaveLength(
      PAGE_SIZE + 50,
    );
    expect(rows.some((r) => r.isLoadMore)).toBe(false);
  });

  it("carries a bounded preview for a huge string; full value on demand", async () => {
    const m = await model({ blob: "A".repeat(5_000_000) });
    const blobRow = (await allRows(m)).find((r) => r.keyOrIndex === "blob")!;
    expect(blobRow.truncatedPreview).toBe(true);
    expect(blobRow.preview.length).toBeLessThanOrEqual(220); // bounded, not 5MB
    const res = await m.getValue(blobRow.nodeId);
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value.value as string).length).toBe(5_000_000);
  });

  it("round-trips multibyte UTF-8 through the byte path", async () => {
    const m = await model({ text: "😀 CJK 文字 café" });
    const textRow = (await allRows(m)).find((r) => r.keyOrIndex === "text")!;
    const res = await m.getValue(textRow.nodeId);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.value).toBe("😀 CJK 文字 café");
  });

  it("bumps revision on structural change and stamps row windows", async () => {
    const m = await model({ a: { b: 1 } });
    const before = m.getRevision();
    const aId = (await m.getRows(0, m.getTotalVisible())).rows.find(
      (r) => r.keyOrIndex === "a",
    )!.nodeId;
    await m.expand(aId);
    expect(m.getRevision()).toBeGreaterThan(before);
    const window = await m.getRows(0, m.getTotalVisible());
    expect(window.revision).toBe(m.getRevision());
  });

  it("getValue never throws — returns an error envelope for bad ids", async () => {
    const m = await model({ a: 1 });
    expect(await m.getValue(-1)).toMatchObject({ ok: false }); // load-more id
    expect(await m.getValue(999999)).toMatchObject({ ok: false }); // unknown id
  });

  it("refreshes a container's descriptor after scan (summary preview + count survives collapse)", async () => {
    const m = await model({ obj: { a: 1, b: 2, c: 3 }, empty: {} });

    // Symptom 1: an expanded container's OWN row shows a structural summary, not
    // the stale pre-scan raw-JSON preview duplicating the child rows below it.
    const objId = (await allRows(m)).find(
      (r) => r.keyOrIndex === "obj",
    )!.nodeId;
    await m.expand(objId);
    const objRow = (await allRows(m)).find((r) => r.keyOrIndex === "obj")!;
    expect(objRow.preview).not.toContain('"a"'); // not the raw {"a":1,...}
    expect(objRow.childCount).toBe(3);

    // Symptom 2: an EMPTY container keeps its 0 count after expand→collapse.
    // loadedCount stays 0 for an empty container, so the earlier
    // `loadedCount > 0` fallback dropped the badge; the refreshed descriptor
    // (childCount === 0) fixes it.
    const emptyId = (await allRows(m)).find(
      (r) => r.keyOrIndex === "empty",
    )!.nodeId;
    await m.expand(emptyId);
    await m.collapse(emptyId);
    const emptyRow = (await allRows(m)).find((r) => r.keyOrIndex === "empty")!;
    expect(emptyRow.childCount).toBe(0);
  });
});
