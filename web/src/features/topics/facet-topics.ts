import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@langfuse/shared";
import { type RouterInputs, type RouterOutputs } from "@/src/utils/api";
import { rangeToString } from "@/src/utils/date-range-utils";

export type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];
export type FacetRow = RouterOutputs["topics"]["traces"]["rows"][number];
export type FacetTopic = Facet["topics"][number];
export type TopicTraceQuery = Omit<
  RouterInputs["topics"]["traces"],
  "projectId" | "facetId" | "cursor"
>;
/** A server-paged trace list; `hasMore` stays true while the scan can continue. */
export type TopicTracesResult = {
  rows: FacetRow[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
};
/** Injected so views stay presentational; `useFacetTopicTraces` is the app implementation. */
export type UseTopicTraces = (
  query: TopicTraceQuery | null,
) => TopicTracesResult;

/** A selected trace outside the loaded pages is fetched by id and pinned on top while it matches the query. */
export function useTracesWithSelection(
  useTraces: UseTopicTraces,
  query: TopicTraceQuery | null,
  selectedTraceId: string | null,
): TopicTracesResult {
  const traces = useTraces(query);
  const selectedLoaded = traces.rows.some(
    (row) => row.traceId === selectedTraceId,
  );
  // An exact trace ID search already decides which trace is listed.
  const pinned = useTraces(
    query && selectedTraceId && !selectedLoaded && !query.traceId
      ? { ...query, traceId: selectedTraceId }
      : null,
  );
  return pinned.rows.length > 0
    ? { ...traces, rows: [...pinned.rows, ...traces.rows] }
    : traces;
}

/** Map topics first, then topics only seen in assignments. Index order drives topic colors in every view. */
export function orderedFacetTopics(facet: Facet) {
  if (!facet.map) return facet.topics;
  const mapped = facet.map.topics;
  return [
    ...mapped,
    ...facet.topics.filter(
      (topic) => !mapped.some((item) => item.id === topic.id),
    ),
  ];
}

/** Tracing link limited to these traces and their time span; null when the IDs exceed the URL budget. */
export function topicTracesHref(
  projectId: string,
  rows: FacetRow[],
  isV4: boolean,
) {
  if (rows.length === 0) return null;
  const filter = encodeFiltersGeneric([
    {
      column: isV4 ? "traceId" : "id",
      type: "stringOptions",
      operator: "any of",
      value: rows.map((row) => row.traceId),
    },
  ]);
  if (filter.length > MAX_URL_FILTER_QUERY_LENGTH) return null;
  const times = rows.map((row) => new Date(row.unitStartTime).getTime());
  const dateRange = rangeToString({
    from: new Date(Math.min(...times) - 60_000),
    to: new Date(Math.max(...times) + 60_000),
  });
  return `/project/${projectId}/traces?filter=${encodeURIComponent(filter)}&dateRange=${encodeURIComponent(dateRange)}`;
}

export function allTopicsLabel(facetName: string) {
  return `${facetName} summaries`;
}
