import {
  type Facet,
  type FacetRow,
  type TopicTraceQuery,
  type UseTopicTraces,
} from "./facet-topics";

type StoryRow = Omit<FacetRow, "outcome"> & { outcome: string };

/** Stories' facet with counts derived from their rows, like the server's aggregates. */
export function storyFacet(
  facet: Omit<Facet, "counts" | "window" | "usableCount" | "awaitingCount">,
  rows: readonly StoryRow[],
): Facet {
  const count = (outcome: string) =>
    rows.filter((row) => row.outcome === outcome).length;
  return {
    ...facet,
    window: { from: new Date("2026-10-01"), to: new Date("2026-10-08") },
    usableCount: rows.length,
    awaitingCount: count("awaiting_map"),
    counts: {
      total: rows.length,
      assigned: count("assigned"),
      outlier: count("outlier"),
      awaitingMap: count("awaiting_map"),
      notApplicable: count("not_applicable"),
      insufficientInput: count("insufficient_input"),
    },
  };
}

function matches(row: StoryRow, query: TopicTraceQuery) {
  if (query.traceId && row.traceId !== query.traceId) return false;
  if (query.assigned !== undefined && (row.topicId !== null) !== query.assigned)
    return false;
  if (query.topicIds) {
    const listed = query.topicIds.values.includes(row.topicId ?? "");
    if ((query.topicIds.operator === "any of") !== listed) return false;
  }
  if (query.statuses) {
    const listed = (query.statuses.values as string[]).includes(row.outcome);
    if ((query.statuses.operator === "any of") !== listed) return false;
  }
  return true;
}

/** Filters story rows the way the server does, without paging. */
export function staticTopicTraces(rows: readonly StoryRow[]): UseTopicTraces {
  return (query) => ({
    rows: (query
      ? rows.filter((row) => matches(row, query))
      : []) as FacetRow[],
    isLoading: false,
    isLoadingMore: false,
    error: null,
    hasMore: false,
    loadMore: () => undefined,
  });
}
