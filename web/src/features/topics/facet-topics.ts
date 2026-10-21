import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { rangeToString } from "@/src/utils/date-range-utils";

export type Facet = RouterOutputs["topics"]["currentResults"]["facets"][number];
export type FacetRow = Facet["rows"][number];
export type FacetTopic = Facet["topics"][number];

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
    // v4 lists observations; root ones stand for their traces.
    ...(isV4
      ? [
          {
            column: "isRootObservation",
            type: "boolean" as const,
            operator: "=" as const,
            value: true,
          },
        ]
      : []),
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
