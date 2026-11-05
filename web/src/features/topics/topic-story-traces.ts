import { useState } from "react";
import { type Facet, type FacetRow, type UseTopicTraces } from "./facet-topics";
import { matchesTopicQuery } from "./topic-trace-filters";

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

/** Filters story rows the way the server does; `pageSize` pages them so lists start short. */
export function staticTopicTraces(
  rows: readonly StoryRow[],
  pageSize = Infinity,
): UseTopicTraces {
  return function useStaticTopicTraces(query) {
    const [loaded, setLoaded] = useState(pageSize);
    const matching = query
      ? rows.filter((row) => matchesTopicQuery(row, query))
      : [];
    return {
      rows: matching.slice(0, loaded) as FacetRow[],
      isLoading: false,
      isLoadingMore: false,
      error: null,
      hasMore: matching.length > loaded,
      loadMore: () => setLoaded((count) => count + pageSize),
    };
  };
}
