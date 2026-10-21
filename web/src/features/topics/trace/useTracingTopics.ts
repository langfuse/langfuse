import { api } from "@/src/utils/api";

/** Facet name → topic names, for the sidebar facet and the search bar. */
export function useTopicFilterOptions(projectId: string, enabled: boolean) {
  return api.topics.filterOptions.useQuery(
    { projectId },
    { enabled, staleTime: 5 * 60 * 1000 },
  ).data;
}

/** Current topics of the visible rows' traces, fetched after the rows and only while the column is shown. */
export function useTraceTopicsForRows(
  projectId: string,
  rows: { traceId?: string | null; startTime: Date }[],
  enabled: boolean,
) {
  const traces = rows.flatMap((row) =>
    row.traceId ? [{ traceId: row.traceId, timestamp: row.startTime }] : [],
  );
  return api.topics.forTraces.useQuery(
    { projectId, traces },
    { enabled: enabled && traces.length > 0, staleTime: 60 * 1000 },
  ).data;
}
