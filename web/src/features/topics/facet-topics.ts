import {
  encodeFiltersGeneric,
  MAX_URL_FILTER_QUERY_LENGTH,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";
import { rangeToString } from "@/src/utils/date-range-utils";
import { summaryTone, type TopicTone } from "./topic-map-colors";

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

/** At least this share of assigned summaries must carry a known label before tones apply. */
const TONE_LABEL_SHARE = 0.5;

export type TopicToneShade = { tone: TopicTone; shade: number };

/**
 * Tone per topic from the label before the colon in its summaries; empty when
 * the facet's summaries mostly carry no known label, so views keep per-topic hues.
 */
export function facetTopicTones(facet: Facet): Map<string, TopicToneShade> {
  const toneCounts = new Map<string, Map<TopicTone, number>>();
  let assigned = 0;
  let labelled = 0;
  for (const row of facet.rows) {
    if (!row.topicId) continue;
    assigned += 1;
    const tone = summaryTone(row.summary);
    if (!tone) continue;
    labelled += 1;
    const counts = toneCounts.get(row.topicId) ?? new Map<TopicTone, number>();
    counts.set(tone, (counts.get(tone) ?? 0) + 1);
    toneCounts.set(row.topicId, counts);
  }
  const result = new Map<string, TopicToneShade>();
  if (assigned === 0 || labelled / assigned < TONE_LABEL_SHARE) return result;
  const shadesUsed = new Map<TopicTone, number>();
  for (const topic of [...facet.topics].sort((a, b) => b.count - a.count)) {
    const counts = toneCounts.get(topic.id);
    if (!counts) continue;
    const tone = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const shade = shadesUsed.get(tone) ?? 0;
    shadesUsed.set(tone, shade + 1);
    result.set(topic.id, { tone, shade });
  }
  return result;
}
