import { beforeEach, describe, expect, it } from "vitest";
import {
  PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT,
  PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT,
  PENDING_TRACE_DELETION_TTL_MS,
  PENDING_TRACE_DELETIONS_STORAGE_KEY,
  addPendingTraceDeletionQuery,
  addPendingTraceDeletions,
  markTraceQueryPendingDeletion,
  markTracesPendingDeletion,
  parsePendingTraceDeletions,
  pendingTraceDeletionSnapshot,
  prunePendingTraceDeletions,
  resetPendingTraceDeletionStore,
  settlePendingTraceDeletionQueries,
  type PendingTraceDeletionQuery,
} from "./pendingTraceDeletions";

const NOW = 1_700_000_000_000;

const query = (
  overrides: Partial<PendingTraceDeletionQuery> = {},
): PendingTraceDeletionQuery => ({
  source: "events",
  filter: [
    { column: "environment", type: "string", operator: "=", value: "prod" },
  ],
  cutoffCreatedAt: new Date(NOW).toISOString(),
  ...overrides,
});

const idsOf = (
  store: ReturnType<typeof parsePendingTraceDeletions>,
  projectId: string,
  now = NOW,
) => [...pendingTraceDeletionSnapshot(store, projectId, now).ids].sort();

describe("pending trace deletions", () => {
  beforeEach(() => {
    resetPendingTraceDeletionStore();
  });

  it("records ids for one project and leaves other projects alone", () => {
    const stored = addPendingTraceDeletions(
      { other: { ids: { keep: NOW }, queries: [] } },
      "project-a",
      ["trace-1", "trace-2"],
      NOW,
    );

    expect(idsOf(stored, "project-a")).toEqual(["trace-1", "trace-2"]);
    expect(idsOf(stored, "other")).toEqual(["keep"]);
    expect(idsOf(stored, "missing")).toEqual([]);
  });

  it("ignores blank ids and an empty list", () => {
    const start = { "project-a": { ids: { keep: NOW }, queries: [] } };
    expect(addPendingTraceDeletions(start, "project-a", [], NOW)).toBe(start);
    expect(addPendingTraceDeletions(start, "project-a", [""], NOW)).toBe(start);
    expect(addPendingTraceDeletions(start, "", ["trace-1"], NOW)).toBe(start);
  });

  it("stores a select-all query with its request time and keeps ids alongside", () => {
    let stored = addPendingTraceDeletions({}, "project-a", ["trace-1"], NOW);
    stored = addPendingTraceDeletionQuery(
      stored,
      "project-a",
      query({ searchType: ["id"] }),
      NOW + 5,
    );

    const snapshot = pendingTraceDeletionSnapshot(stored, "project-a", NOW + 5);
    expect([...snapshot.ids]).toEqual(["trace-1"]);
    expect(snapshot.queries).toEqual([
      { ...query({ searchType: ["id"] }), createdAt: NOW + 5 },
    ]);
  });

  it("rejects a query without a valid cutoff", () => {
    const start = {};
    expect(
      addPendingTraceDeletionQuery(
        start,
        "project-a",
        query({ cutoffCreatedAt: "not-a-date" }),
        NOW,
      ),
    ).toBe(start);
  });

  it("drops ids and queries once they are older than the retention window", () => {
    let stored = addPendingTraceDeletions({}, "project-a", ["trace-1"], NOW);
    stored = addPendingTraceDeletionQuery(stored, "project-a", query(), NOW);
    const beforeExpiry = NOW + PENDING_TRACE_DELETION_TTL_MS - 1;

    expect(idsOf(stored, "project-a", beforeExpiry)).toEqual(["trace-1"]);
    expect(
      pendingTraceDeletionSnapshot(stored, "project-a", beforeExpiry).queries,
    ).toHaveLength(1);
    expect(prunePendingTraceDeletions(stored, beforeExpiry)).toBe(stored);

    const expiry = NOW + PENDING_TRACE_DELETION_TTL_MS;
    expect(
      pendingTraceDeletionSnapshot(stored, "project-a", expiry).queries,
    ).toHaveLength(0);
    const pruned = prunePendingTraceDeletions(stored, expiry);
    expect(pruned).toEqual({});
    expect(prunePendingTraceDeletions(pruned, NOW)).toBe(pruned);
  });

  it("drops the oldest ids when a project exceeds the id cap", () => {
    const total = PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT + 2;
    const ids: Record<string, number> = {};
    for (let i = 0; i < total; i++) ids[`t-${i}`] = NOW + i;

    const pruned = prunePendingTraceDeletions(
      { "project-a": { ids, queries: [] } },
      NOW + total,
    );
    const kept = pendingTraceDeletionSnapshot(
      pruned,
      "project-a",
      NOW + total,
    ).ids;
    expect(kept.size).toBe(PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT);
    expect(kept.has("t-0")).toBe(false);
    expect(kept.has("t-1")).toBe(false);
    expect(kept.has(`t-${total - 1}`)).toBe(true);
  });

  it("drops the oldest queries when a project exceeds the query cap", () => {
    let stored = {};
    const total = PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT + 3;
    for (let i = 0; i < total; i++) {
      stored = addPendingTraceDeletionQuery(
        stored,
        "project-a",
        query({ searchQuery: `q-${i}` }),
        NOW + i,
      );
    }
    const queries = pendingTraceDeletionSnapshot(
      stored,
      "project-a",
      NOW + total,
    ).queries;
    expect(queries).toHaveLength(
      PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT,
    );
    expect(queries[0]?.searchQuery).toBe("q-3");
    expect(queries.at(-1)?.searchQuery).toBe(`q-${total - 1}`);
  });

  it("settles queries requested before the confirmation and keeps later ones and ids", () => {
    let stored = addPendingTraceDeletions({}, "project-a", ["trace-1"], NOW);
    stored = addPendingTraceDeletionQuery(stored, "project-a", query(), NOW);
    stored = addPendingTraceDeletionQuery(
      stored,
      "project-a",
      query({ source: "traces" }),
      NOW + 100,
    );

    const settled = settlePendingTraceDeletionQueries(
      stored,
      "project-a",
      NOW + 50,
    );
    const snapshot = pendingTraceDeletionSnapshot(settled, "project-a", NOW);
    expect(snapshot.queries.map((entry) => entry.source)).toEqual(["traces"]);
    expect([...snapshot.ids]).toEqual(["trace-1"]);

    expect(settlePendingTraceDeletionQueries(settled, "project-a", NOW)).toBe(
      settled,
    );
    expect(settlePendingTraceDeletionQueries(settled, "missing", NOW)).toBe(
      settled,
    );
  });

  it("removes a project once settling leaves it empty", () => {
    const stored = addPendingTraceDeletionQuery({}, "project-a", query(), NOW);
    expect(
      settlePendingTraceDeletionQueries(stored, "project-a", NOW + 1),
    ).toEqual({});
  });

  it("ignores malformed storage", () => {
    expect(parsePendingTraceDeletions(null)).toEqual({});
    expect(parsePendingTraceDeletions("not-json")).toEqual({});
    expect(parsePendingTraceDeletions("[]")).toEqual({});
    expect(parsePendingTraceDeletions('{"p":{"t":"nope"}}')).toEqual({});
    expect(
      parsePendingTraceDeletions(
        JSON.stringify({
          p: {
            ids: { good: NOW, bad: "x" },
            queries: [
              { source: "nope", filter: [], cutoffCreatedAt: "", createdAt: 1 },
              { ...query(), createdAt: NOW },
            ],
          },
        }),
      ),
    ).toEqual({
      p: { ids: { good: NOW }, queries: [{ ...query(), createdAt: NOW }] },
    });
  });

  it("persists marks and does not write when there is nothing to add", () => {
    markTracesPendingDeletion("project-a", ["trace-1"], NOW);
    markTraceQueryPendingDeletion("project-a", query(), NOW);
    const stored = parsePendingTraceDeletions(
      localStorage.getItem(PENDING_TRACE_DELETIONS_STORAGE_KEY),
    );
    const snapshot = pendingTraceDeletionSnapshot(stored, "project-a", NOW);
    expect([...snapshot.ids]).toEqual(["trace-1"]);
    expect(snapshot.queries).toHaveLength(1);

    markTracesPendingDeletion("project-a", [], NOW);
    expect(localStorage.getItem(PENDING_TRACE_DELETIONS_STORAGE_KEY)).toBe(
      JSON.stringify(stored),
    );
  });
});
