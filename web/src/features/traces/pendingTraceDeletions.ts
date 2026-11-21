import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type TraceDeletePredicateSource } from "@langfuse/shared";

/**
 * Traces the user has asked to delete, before the async deletion job removes
 * them. Scoped by project and persisted so a reload keeps hiding them.
 *
 * Explicit row selections are stored as ids. Select-all deletes are stored as
 * the query the batch action resolves (filter, search, cutoff) instead, since
 * they can cover far more traces than were ever loaded. Every entry expires on
 * its own so storage cannot grow without bound.
 */
export const PENDING_TRACE_DELETIONS_STORAGE_KEY =
  "langfuse.pending-trace-deletions.v1";

/** Matches the upper bound the confirmation dialog tells the user. */
export const PENDING_TRACE_DELETION_TTL_MS = 48 * 60 * 60 * 1000;

/** Oldest ids are dropped first once a project exceeds this. */
export const PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT = 1000;

/** Oldest select-all entries are dropped first once a project exceeds this. */
export const PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT = 20;

/** The batch-action query as dispatched, in its JSON form. */
export type PendingTraceDeletionQuery = {
  source: TraceDeletePredicateSource;
  filter: unknown[];
  searchQuery?: string;
  searchType?: string[];
  /** ISO timestamp returned by the server for this batch action. */
  cutoffCreatedAt: string;
};

export type PendingTraceDeletionQueryEntry = PendingTraceDeletionQuery & {
  /** Epoch ms the delete was requested. */
  createdAt: number;
};

type PendingTraceDeletionProject = {
  /** traceId -> epoch ms the delete was requested. */
  ids: Record<string, number>;
  queries: PendingTraceDeletionQueryEntry[];
};

export type PendingTraceDeletions = Record<string, PendingTraceDeletionProject>;

export type PendingTraceDeletionSnapshot = {
  ids: ReadonlySet<string>;
  queries: readonly PendingTraceDeletionQueryEntry[];
};

const SERVER_SNAPSHOT = "";
const EMPTY_SNAPSHOT: PendingTraceDeletionSnapshot = {
  ids: new Set(),
  queries: [],
};

// Used only when localStorage refuses the write. Readers prefer storage.
let memoryRaw: string | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isTimestamp = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseQueryEntry(
  value: unknown,
): PendingTraceDeletionQueryEntry | null {
  if (!isRecord(value)) return null;
  const {
    source,
    filter,
    searchQuery,
    searchType,
    cutoffCreatedAt,
    createdAt,
  } = value;
  if (source !== "traces" && source !== "events") return null;
  if (!Array.isArray(filter)) return null;
  if (searchQuery !== undefined && typeof searchQuery !== "string") return null;
  if (
    searchType !== undefined &&
    !(
      Array.isArray(searchType) &&
      searchType.every((type) => typeof type === "string")
    )
  ) {
    return null;
  }
  if (
    typeof cutoffCreatedAt !== "string" ||
    !Number.isFinite(Date.parse(cutoffCreatedAt))
  ) {
    return null;
  }
  if (!isTimestamp(createdAt)) return null;
  return {
    source,
    filter,
    ...(searchQuery !== undefined ? { searchQuery } : {}),
    ...(searchType !== undefined ? { searchType } : {}),
    cutoffCreatedAt,
    createdAt,
  };
}

export function parsePendingTraceDeletions(
  raw: string | null | undefined,
): PendingTraceDeletions {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return {};

    const store: PendingTraceDeletions = {};
    for (const [projectId, project] of Object.entries(value)) {
      if (!isRecord(project)) continue;
      const ids: Record<string, number> = {};
      if (isRecord(project.ids)) {
        for (const [traceId, requestedAt] of Object.entries(project.ids)) {
          if (traceId && isTimestamp(requestedAt)) ids[traceId] = requestedAt;
        }
      }
      const queries = Array.isArray(project.queries)
        ? project.queries.flatMap((entry) => {
            const parsed = parseQueryEntry(entry);
            return parsed ? [parsed] : [];
          })
        : [];
      if (Object.keys(ids).length > 0 || queries.length > 0) {
        store[projectId] = { ids, queries };
      }
    }
    return store;
  } catch {
    return {};
  }
}

function capIds(entries: Record<string, number>): Record<string, number> {
  const pairs = Object.entries(entries);
  if (pairs.length <= PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT) {
    return entries;
  }
  pairs.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  return Object.fromEntries(
    pairs.slice(pairs.length - PENDING_TRACE_DELETION_MAX_IDS_PER_PROJECT),
  );
}

function capQueries(
  queries: PendingTraceDeletionQueryEntry[],
): PendingTraceDeletionQueryEntry[] {
  if (queries.length <= PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT) {
    return queries;
  }
  return [...queries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(queries.length - PENDING_TRACE_DELETION_MAX_QUERIES_PER_PROJECT);
}

/** Drops expired entries and enforces the per-project caps. Same reference when nothing changed. */
export function prunePendingTraceDeletions(
  store: PendingTraceDeletions,
  now: number,
  ttlMs: number = PENDING_TRACE_DELETION_TTL_MS,
): PendingTraceDeletions {
  let changed = false;
  const next: PendingTraceDeletions = {};

  for (const [projectId, project] of Object.entries(store)) {
    const keptIds: Record<string, number> = {};
    for (const [traceId, requestedAt] of Object.entries(project.ids)) {
      if (now - requestedAt < ttlMs) keptIds[traceId] = requestedAt;
    }
    const ids = capIds(keptIds);
    const queries = capQueries(
      project.queries.filter((entry) => now - entry.createdAt < ttlMs),
    );
    if (
      Object.keys(ids).length !== Object.keys(project.ids).length ||
      queries.length !== project.queries.length
    ) {
      changed = true;
    }
    if (Object.keys(ids).length === 0 && queries.length === 0) {
      changed = true;
      continue;
    }
    next[projectId] = { ids, queries };
  }

  return changed ? next : store;
}

const emptyProject = (): PendingTraceDeletionProject => ({
  ids: {},
  queries: [],
});

export function addPendingTraceDeletions(
  store: PendingTraceDeletions,
  projectId: string,
  traceIds: readonly string[],
  now: number,
): PendingTraceDeletions {
  const ids = traceIds.filter((id) => id.length > 0);
  if (ids.length === 0 || projectId.length === 0) return store;

  const pruned = prunePendingTraceDeletions(store, now);
  const project = pruned[projectId] ?? emptyProject();
  const nextIds = { ...project.ids };
  for (const id of ids) nextIds[id] = now;
  return {
    ...pruned,
    [projectId]: { ...project, ids: capIds(nextIds) },
  };
}

export function addPendingTraceDeletionQuery(
  store: PendingTraceDeletions,
  projectId: string,
  query: PendingTraceDeletionQuery,
  now: number,
): PendingTraceDeletions {
  if (projectId.length === 0) return store;
  const entry = parseQueryEntry({ ...query, createdAt: now });
  if (!entry) return store;

  const pruned = prunePendingTraceDeletions(store, now);
  const project = pruned[projectId] ?? emptyProject();
  return {
    ...pruned,
    [projectId]: {
      ...project,
      queries: capQueries([...project.queries, entry]),
    },
  };
}

/** Drops select-all entries requested before `settledBefore`, once the server reports no trace delete is running. */
export function settlePendingTraceDeletionQueries(
  store: PendingTraceDeletions,
  projectId: string,
  settledBefore: number,
): PendingTraceDeletions {
  const project = store[projectId];
  if (!project) return store;
  const queries = project.queries.filter(
    (entry) => entry.createdAt >= settledBefore,
  );
  if (queries.length === project.queries.length) return store;
  const next = { ...store };
  if (queries.length === 0 && Object.keys(project.ids).length === 0) {
    delete next[projectId];
  } else {
    next[projectId] = { ...project, queries };
  }
  return next;
}

export function pendingTraceDeletionSnapshot(
  store: PendingTraceDeletions,
  projectId: string,
  now: number,
): PendingTraceDeletionSnapshot {
  const project = store[projectId];
  if (!project) return EMPTY_SNAPSHOT;
  return {
    ids: new Set(
      Object.entries(project.ids)
        .filter(
          ([, requestedAt]) =>
            now - requestedAt < PENDING_TRACE_DELETION_TTL_MS,
        )
        .map(([traceId]) => traceId),
    ),
    queries: project.queries.filter(
      (entry) => now - entry.createdAt < PENDING_TRACE_DELETION_TTL_MS,
    ),
  };
}

function readRaw(): string {
  if (memoryRaw !== null) return memoryRaw;
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    return (
      window.localStorage.getItem(PENDING_TRACE_DELETIONS_STORAGE_KEY) ??
      SERVER_SNAPSHOT
    );
  } catch {
    return SERVER_SNAPSHOT;
  }
}

function writeRaw(serialized: string) {
  memoryRaw = serialized;
  try {
    window.localStorage.setItem(
      PENDING_TRACE_DELETIONS_STORAGE_KEY,
      serialized,
    );
  } catch {
    // Private mode or a full quota. memoryRaw still hides the rows in this
    // tab; a reload cannot restore what storage refused.
  }
  window.dispatchEvent(
    new CustomEvent("localStorageChange", {
      detail: {
        key: PENDING_TRACE_DELETIONS_STORAGE_KEY,
        newValue: serialized,
      },
    }),
  );
}

function update(
  apply: (current: PendingTraceDeletions) => PendingTraceDeletions,
) {
  if (typeof window === "undefined") return;
  const current = parsePendingTraceDeletions(readRaw());
  const next = apply(current);
  if (next === current) return;
  writeRaw(JSON.stringify(next));
}

/** Test helper. Production code never needs to drop the in-memory snapshot. */
export function resetPendingTraceDeletionStore() {
  memoryRaw = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_TRACE_DELETIONS_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the in-memory snapshot is already cleared.
  }
}

export function markTracesPendingDeletion(
  projectId: string,
  traceIds: readonly string[],
  now: number = Date.now(),
) {
  if (traceIds.length === 0) return;
  update((current) =>
    addPendingTraceDeletions(current, projectId, traceIds, now),
  );
}

export function markTraceQueryPendingDeletion(
  projectId: string,
  query: PendingTraceDeletionQuery,
  now: number = Date.now(),
) {
  update((current) =>
    addPendingTraceDeletionQuery(current, projectId, query, now),
  );
}

export function settleTraceDeletionQueries(
  projectId: string,
  settledBefore: number,
) {
  update((current) =>
    settlePendingTraceDeletionQueries(current, projectId, settledBefore),
  );
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (
      event.key === PENDING_TRACE_DELETIONS_STORAGE_KEY ||
      event.key === null
    ) {
      // Another tab wrote the key. Drop the in-memory copy so the next
      // snapshot reads that tab's value.
      memoryRaw = null;
      onChange();
    }
  };
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    if (detail?.key === PENDING_TRACE_DELETIONS_STORAGE_KEY) onChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener("localStorageChange", onCustom);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("localStorageChange", onCustom);
  };
}

export function usePendingTraceDeletionSnapshot(
  projectId: string,
): PendingTraceDeletionSnapshot {
  const raw = useSyncExternalStore(subscribe, readRaw, () => SERVER_SNAPSHOT);

  useEffect(() => {
    update((current) => prunePendingTraceDeletions(current, Date.now()));
  }, [raw]);

  return useMemo(
    () =>
      pendingTraceDeletionSnapshot(
        parsePendingTraceDeletions(raw),
        projectId,
        Date.now(),
      ),
    [raw, projectId],
  );
}
