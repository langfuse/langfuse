/**
 * InMemoryRowModel must keep cost proportional to what is expanded/visible, not
 * to document size (LFE-11080): only the expanded level is materialized, wide
 * containers paginate, rows carry bounded previews, full values come on demand.
 */
import { describe, it, expect } from "vitest";
import { InMemoryRowModel } from "./inMemoryRowModel";
import { CHILD_PAGE_SIZE } from "../utils/childProvider";

const allRows = (m: InMemoryRowModel) => m.getRows(0, m.getTotalVisible());
const keys = (rows: { keyOrIndex: string | number | null }[]) =>
  rows.map((r) => r.keyOrIndex);

describe("InMemoryRowModel", () => {
  it("expands only the root level; deeper containers stay collapsed", async () => {
    const m = new InMemoryRowModel({
      a: 1,
      b: { deep: { deeper: 1 } },
      c: [1, 2],
    });
    const rows = await allRows(m);

    expect(keys(rows)).toEqual([null, "a", "b", "c"]); // root + level 1 only
    expect(rows.find((r) => r.keyOrIndex === "b")).toMatchObject({
      expandable: true,
      expanded: false,
      childCount: 1,
    });
    // b's descendants are NOT materialized/visible until b is expanded.
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(false);
  });

  it("expand materializes only that container's immediate children", async () => {
    const m = new InMemoryRowModel({ b: { deep: { deeper: 1 } } });
    const bId = (await allRows(m)).find((r) => r.keyOrIndex === "b")!.nodeId;

    await m.expand(bId);
    const rows = await allRows(m);
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(true); // one level down
    expect(rows.some((r) => r.keyOrIndex === "deeper")).toBe(false); // not two
  });

  it("collapse drops the visible descendants", async () => {
    const m = new InMemoryRowModel({ b: { deep: 1 } });
    const bId = (await allRows(m)).find((r) => r.keyOrIndex === "b")!.nodeId;
    await m.expand(bId);
    expect((await allRows(m)).some((r) => r.keyOrIndex === "deep")).toBe(true);

    await m.collapse(bId);
    const rows = await allRows(m);
    expect(rows.some((r) => r.keyOrIndex === "deep")).toBe(false);
    expect(keys(rows)).toEqual([null, "b"]);
  });

  it("does NOT flatten a huge collapsed container", async () => {
    const huge = {
      messages: Array.from({ length: 100_000 }, () => ({ role: "user" })),
    };
    const m = new InMemoryRowModel(huge);
    // root + "messages" (collapsed) — the 100k elements are never materialized.
    expect(m.getTotalVisible()).toBe(2);
  });

  it("paginates a wide container: first page + load-more, then reveals the rest", async () => {
    const wide = {
      items: Array.from({ length: CHILD_PAGE_SIZE + 50 }, (_, i) => i),
    };
    const m = new InMemoryRowModel(wide);
    const itemsId = (await allRows(m)).find(
      (r) => r.keyOrIndex === "items",
    )!.nodeId;

    await m.expand(itemsId);
    let rows = await allRows(m);
    let itemRows = rows.filter((r) => typeof r.keyOrIndex === "number");
    const loadMore = rows.find((r) => r.isLoadMore);
    expect(itemRows).toHaveLength(CHILD_PAGE_SIZE); // only the first page
    expect(loadMore).toBeDefined();

    await m.loadMore(loadMore!.nodeId);
    rows = await allRows(m);
    itemRows = rows.filter((r) => typeof r.keyOrIndex === "number");
    expect(itemRows).toHaveLength(CHILD_PAGE_SIZE + 50); // rest revealed
    expect(rows.some((r) => r.isLoadMore)).toBe(false); // no more
  });

  it("carries a bounded preview for a huge string; full value on demand", async () => {
    const m = new InMemoryRowModel({ blob: "A".repeat(5_000_000) });
    const blobRow = (await allRows(m)).find((r) => r.keyOrIndex === "blob")!;

    expect(blobRow.truncatedPreview).toBe(true);
    expect(blobRow.preview.length).toBeLessThanOrEqual(200); // never the 5MB
    const materialized = await m.getValue(blobRow.nodeId);
    expect((materialized.value as string).length).toBe(5_000_000);
  });

  it("handles a primitive root (single, non-expandable row)", async () => {
    const m = new InMemoryRowModel(42);
    const rows = await allRows(m);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: "number", expandable: false });
  });
});
