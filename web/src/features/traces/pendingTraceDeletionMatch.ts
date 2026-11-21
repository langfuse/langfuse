import {
  compileTraceDeletePredicate,
  eventsTableSingleFilterList,
  TracingSearchType,
  type CompiledTraceDeletePredicate,
  type TraceDeleteCandidate,
} from "@langfuse/shared";
import { type PendingTraceDeletionQueryEntry } from "@/src/features/traces/pendingTraceDeletions";

export function compilePendingTraceDeletionQuery(
  entry: PendingTraceDeletionQueryEntry,
): CompiledTraceDeletePredicate {
  const filter = eventsTableSingleFilterList.safeParse(entry.filter);
  if (!filter.success) {
    return {
      supported: false,
      source: entry.source,
      reason: "stored filter does not parse",
    };
  }
  const searchType = TracingSearchType.array().safeParse(
    entry.searchType ?? [],
  );
  return compileTraceDeletePredicate({
    source: entry.source,
    filter: filter.data,
    searchQuery: entry.searchQuery,
    searchType: searchType.success ? searchType.data : undefined,
    cutoffCreatedAt: new Date(entry.cutoffCreatedAt),
  });
}

type TraceLike = {
  id: string;
  name?: string | null;
  timestamp: Date;
  userId?: string | null;
  sessionId?: string | null;
  release?: string | null;
  version?: string | null;
  environment?: string | null;
  tags: string[];
  bookmarked?: boolean;
};

/** A legacy traces-table row or trace detail, keyed by traces-table column. */
export function traceDeleteCandidateFromTrace(
  trace: TraceLike,
): TraceDeleteCandidate {
  return {
    traceId: trace.id,
    id: trace.id,
    name: trace.name ?? null,
    traceName: trace.name ?? null,
    timestamp: trace.timestamp,
    userId: trace.userId ?? null,
    sessionId: trace.sessionId ?? null,
    release: trace.release ?? null,
    version: trace.version ?? null,
    environment: trace.environment ?? null,
    tags: trace.tags,
    traceTags: trace.tags,
    ...(trace.bookmarked !== undefined ? { bookmarked: trace.bookmarked } : {}),
  };
}

type ObservationLike = {
  id: string;
  traceId?: string | null;
  name?: string | null;
  type?: string | null;
  startTime: Date;
  environment?: string | null;
  level?: string | null;
  version?: string | null;
  promptName?: string | null;
  parentObservationId?: string | null;
};

/**
 * Fields an observation carries in both the events list and the trace detail,
 * keyed by events-table column. Trace-level columns are left out: the trace
 * detail does not load them per observation.
 */
export function traceDeleteCandidateFromObservation(
  observation: ObservationLike & { providedModelName?: string | null },
): TraceDeleteCandidate | null {
  if (!observation.traceId) return null;
  return {
    traceId: observation.traceId,
    id: observation.id,
    name: observation.name ?? null,
    type: observation.type ?? null,
    startTime: observation.startTime,
    environment: observation.environment ?? null,
    traceEnvironment: observation.environment ?? null,
    level: observation.level ?? null,
    version: observation.version ?? null,
    providedModelName: observation.providedModelName ?? null,
    promptName: observation.promptName ?? null,
    parentObservationId: observation.parentObservationId ?? null,
  };
}

type EventsRowLike = ObservationLike & {
  model?: string | null;
  release?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  traceName?: string | null;
  traceTags?: string[] | null;
};

/** One events-table list row, keyed by events-table column. */
export function traceDeleteCandidateFromEventsRow(
  row: EventsRowLike,
): TraceDeleteCandidate | null {
  const base = traceDeleteCandidateFromObservation({
    ...row,
    providedModelName: row.model,
  });
  if (!base) return null;
  return {
    ...base,
    release: row.release ?? null,
    userId: row.userId ?? null,
    sessionId: row.sessionId ?? null,
    traceName: row.traceName ?? null,
    ...(row.traceTags ? { tags: row.traceTags, traceTags: row.traceTags } : {}),
  };
}
