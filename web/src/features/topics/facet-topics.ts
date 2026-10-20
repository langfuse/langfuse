import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { rangeToString } from "@/src/utils/date-range-utils";
import { type TopicTone, topicTone } from "./topic-map-colors";

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

export function facetTopicTones(facet: Facet): Map<string, TopicTone> {
  const summaries = new Map<string, string[]>();
  for (const row of facet.rows) {
    if (!row.topicId) continue;
    const list = summaries.get(row.topicId) ?? [];
    list.push(row.summary);
    summaries.set(row.topicId, list);
  }
  const tones = new Map<string, TopicTone>();
  for (const [topicId, list] of summaries) {
    const tone = topicTone(facet.name, list);
    if (tone) tones.set(topicId, tone);
  }
  return tones;
}

export function allTopicsLabel(facetName: string) {
  const name = facetName.toLowerCase();
  return `All ${name.endsWith("s") ? name : `${name}s`}`;
}
