import { useEffect, useMemo, useSyncExternalStore } from "react";

/**
 * Trace ids the user has asked to delete, before the async deletion job
 * removes them. Scoped by project and persisted so a reload keeps hiding them.
 * Entries expire on their own so storage cannot grow without bound.
 */
export const PENDING_TRACE_DELETIONS_STORAGE_KEY =
  "langfuse.pending-trace-deletions.v1";

/** Matches the upper bound the confirmation dialog tells the user. */
export const PENDING_TRACE_DELETION_TTL_MS = 48 * 60 * 60 * 1000;

/** Oldest ids are dropped first once a project exceeds this. */
export const PENDING_TRACE_DELETION_MAX_PER_PROJECT = 2000;

/** projectId -> traceId -> epoch ms the delete was requested. */
export type PendingTraceDeletions = Record<string, Record<string, number>>;

const SERVER_SNAPSHOT = "";

// Used only when localStorage refuses the write. Readers prefer storage.
let memoryRaw: string | null = null;

export function parsePendingTraceDeletions(
  raw: string | null | undefined,
): PendingTraceDeletions {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};

    const store: PendingTraceDeletions = {};
    for (const [projectId, entries] of Object.entries(value)) {
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
        continue;
      }
      const project: Record<string, number> = {};
      for (const [traceId, requestedAt] of Object.entries(entries)) {
        if (
          traceId &&
          typeof requestedAt === "number" &&
          Number.isFinite(requestedAt)
        ) {
          project[traceId] = requestedAt;
        }
      }
      if (Object.keys(project).length > 0) store[projectId] = project;
    }
    return store;
  } catch {
    return {};
  }
}

function capProject(entries: Record<string, number>): Record<string, number> {
  const pairs = Object.entries(entries);
  if (pairs.length <= PENDING_TRACE_DELETION_MAX_PER_PROJECT) return entries;
  pairs.sort((a, b) => {
    if (a[1] !== b[1]) return a[1] - b[1];
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    return 0;
  });
  return Object.fromEntries(
    pairs.slice(pairs.length - PENDING_TRACE_DELETION_MAX_PER_PROJECT),
  );
}

/** Drops expired ids and enforces the per-project cap. Same reference when nothing changed. */
export function prunePendingTraceDeletions(
  store: PendingTraceDeletions,
  now: number,
  ttlMs: number = PENDING_TRACE_DELETION_TTL_MS,
): PendingTraceDeletions {
  let changed = false;
  const next: PendingTraceDeletions = {};

  for (const [projectId, entries] of Object.entries(store)) {
    const kept: Record<string, number> = {};
    for (const [traceId, requestedAt] of Object.entries(entries)) {
      if (now - requestedAt < ttlMs) kept[traceId] = requestedAt;
      else changed = true;
    }
    const capped = capProject(kept);
    if (capped !== kept) changed = true;
    if (Object.keys(capped).length === 0) {
      if (Object.keys(entries).length > 0) changed = true;
      continue;
    }
    if (Object.keys(capped).length !== Object.keys(entries).length) {
      changed = true;
    }
    next[projectId] = capped;
  }

  return changed ? next : store;
}

export function addPendingTraceDeletions(
  store: PendingTraceDeletions,
  projectId: string,
  traceIds: readonly string[],
  now: number,
): PendingTraceDeletions {
  const ids = traceIds.filter((id) => id.length > 0);
  if (ids.length === 0 || projectId.length === 0) return store;

  const pruned = prunePendingTraceDeletions(store, now);
  const project = { ...(pruned[projectId] ?? {}) };
  for (const id of ids) project[id] = now;
  return {
    ...pruned,
    [projectId]: capProject(project),
  };
}

export function pendingTraceIdSet(
  store: PendingTraceDeletions,
  projectId: string,
  now: number,
): ReadonlySet<string> {
  const entries = store[projectId];
  if (!entries) return new Set();
  return new Set(
    Object.entries(entries)
      .filter(
        ([, requestedAt]) => now - requestedAt < PENDING_TRACE_DELETION_TTL_MS,
      )
      .map(([traceId]) => traceId),
  );
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

function commit(next: PendingTraceDeletions) {
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
  if (typeof window === "undefined" || traceIds.length === 0) return;
  const current = parsePendingTraceDeletions(readRaw());
  const next = addPendingTraceDeletions(current, projectId, traceIds, now);
  if (next === current) return;
  commit(next);
}

function pruneStored(now: number) {
  if (typeof window === "undefined") return;
  const current = parsePendingTraceDeletions(readRaw());
  const next = prunePendingTraceDeletions(current, now);
  if (next === current) return;
  commit(next);
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

export function usePendingTraceDeletionIds(
  projectId: string,
): ReadonlySet<string> {
  const raw = useSyncExternalStore(subscribe, readRaw, () => SERVER_SNAPSHOT);

  useEffect(() => {
    pruneStored(Date.now());
  }, [raw]);

  return useMemo(
    () =>
      pendingTraceIdSet(parsePendingTraceDeletions(raw), projectId, Date.now()),
    [raw, projectId],
  );
}
