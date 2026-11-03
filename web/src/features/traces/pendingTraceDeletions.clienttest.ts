import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_TRACE_DELETION_MAX_PER_PROJECT,
  PENDING_TRACE_DELETION_TTL_MS,
  PENDING_TRACE_DELETIONS_STORAGE_KEY,
  addPendingTraceDeletions,
  markTracesPendingDeletion,
  parsePendingTraceDeletions,
  pendingTraceIdSet,
  prunePendingTraceDeletions,
  resetPendingTraceDeletionStore,
} from "./pendingTraceDeletions";

const NOW = 1_700_000_000_000;

describe("pending trace deletions", () => {
  beforeEach(() => {
    resetPendingTraceDeletionStore();
  });

  it("records ids for one project and leaves other projects alone", () => {
    const stored = addPendingTraceDeletions(
      { other: { keep: NOW } },
      "project-a",
      ["trace-1", "trace-2"],
      NOW,
    );

    expect([...pendingTraceIdSet(stored, "project-a", NOW)].sort()).toEqual([
      "trace-1",
      "trace-2",
    ]);
    expect([...pendingTraceIdSet(stored, "other", NOW)]).toEqual(["keep"]);
    expect(pendingTraceIdSet(stored, "missing", NOW).size).toBe(0);
  });

  it("ignores blank ids and an empty list", () => {
    const start = { "project-a": { keep: NOW } };
    expect(addPendingTraceDeletions(start, "project-a", [], NOW)).toBe(start);
    expect(addPendingTraceDeletions(start, "project-a", [""], NOW)).toBe(start);
    expect(addPendingTraceDeletions(start, "", ["trace-1"], NOW)).toBe(start);
  });

  it("drops ids once they are older than the retention window", () => {
    const stored = addPendingTraceDeletions({}, "project-a", ["trace-1"], NOW);
    expect(
      pendingTraceIdSet(
        stored,
        "project-a",
        NOW + PENDING_TRACE_DELETION_TTL_MS - 1,
      ).has("trace-1"),
    ).toBe(true);

    const pruned = prunePendingTraceDeletions(
      stored,
      NOW + PENDING_TRACE_DELETION_TTL_MS,
    );
    expect(pruned).toEqual({});
    expect(prunePendingTraceDeletions(pruned, NOW)).toBe(pruned);
  });

  it("drops the oldest ids when a project exceeds the cap", () => {
    const total = PENDING_TRACE_DELETION_MAX_PER_PROJECT + 2;
    const entries: Record<string, number> = {};
    for (let i = 0; i < total; i++) entries[`t-${i}`] = NOW + i;

    const pruned = prunePendingTraceDeletions(
      { "project-a": entries },
      NOW + total,
    );
    const ids = pendingTraceIdSet(pruned, "project-a", NOW + total);
    expect(ids.size).toBe(PENDING_TRACE_DELETION_MAX_PER_PROJECT);
    expect(ids.has("t-0")).toBe(false);
    expect(ids.has("t-1")).toBe(false);
    expect(ids.has(`t-${total - 1}`)).toBe(true);
  });

  it("ignores malformed storage", () => {
    expect(parsePendingTraceDeletions(null)).toEqual({});
    expect(parsePendingTraceDeletions("not-json")).toEqual({});
    expect(parsePendingTraceDeletions("[]")).toEqual({});
    expect(parsePendingTraceDeletions('{"p":{"t":"nope"}}')).toEqual({});
  });

  it("persists a successful mark and does not write when there is nothing to add", () => {
    markTracesPendingDeletion("project-a", ["trace-1"], NOW);
    const stored = parsePendingTraceDeletions(
      localStorage.getItem(PENDING_TRACE_DELETIONS_STORAGE_KEY),
    );
    expect(pendingTraceIdSet(stored, "project-a", NOW).has("trace-1")).toBe(
      true,
    );

    markTracesPendingDeletion("project-a", [], NOW);
    expect(localStorage.getItem(PENDING_TRACE_DELETIONS_STORAGE_KEY)).toBe(
      JSON.stringify(stored),
    );
  });
});
