import { type FilterState } from "@langfuse/shared";
import { isTopicFilter } from "@langfuse/shared/topics";

/** Topics past this many fold into one grey segment. */
export const TOPIC_STRIPE_SLOTS = 16;

type TraceTopics = Record<string, { facet: string; topic: string }[]>;

export type TopicStripeSegment =
  /** `slot` is the topic's index in the facet's published topics, so colours stay stable across filters. */
  | { kind: "topic"; name: string; count: number; slot: number }
  | { kind: "more"; count: number; topicCount: number }
  | { kind: "unassigned"; count: number };

/** Intent when the project has it, else the first facet. */
export function topicStripeFacet(facets: string[]) {
  return (
    facets.find((name) => name.toLowerCase() === "intent") ?? facets[0] ?? null
  );
}

/** Distinct traces per topic of one facet, largest first; then the folded tail and unassigned traces. */
export function topicStripeSegments({
  rows,
  topicsByTrace,
  facet,
  facetTopics,
}: {
  rows: { traceId?: string | null }[];
  topicsByTrace: TraceTopics;
  facet: string;
  facetTopics: string[];
}): TopicStripeSegment[] {
  const traceIds = new Set(rows.flatMap((row) => row.traceId ?? []));
  const counts = new Map<string, number>();
  let unassigned = 0;
  for (const traceId of traceIds) {
    // Several rule maps can each assign the facet a topic.
    const names = new Set(
      (topicsByTrace[traceId] ?? [])
        .filter((item) => item.facet === facet)
        .map((item) => item.topic),
    );
    if (names.size === 0) unassigned++;
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const topics = [...counts]
    .map(([name, count]) => ({
      kind: "topic" as const,
      name,
      count,
      slot: facetTopics.indexOf(name),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const folded = topics.slice(TOPIC_STRIPE_SLOTS);
  return [
    ...topics.slice(0, TOPIC_STRIPE_SLOTS),
    ...(folded.length > 0
      ? [
          {
            kind: "more" as const,
            count: folded.reduce((sum, topic) => sum + topic.count, 0),
            topicCount: folded.length,
          },
        ]
      : []),
    ...(unassigned > 0
      ? [{ kind: "unassigned" as const, count: unassigned }]
      : []),
  ];
}

const isFacetAnyOfFilter = (facet: string) => (filter: FilterState[number]) =>
  isTopicFilter(filter) && filter.key === facet && filter.operator === "any of";

/** Topics picked in the facet's "any of" filter. */
export function selectedStripeTopics(filters: FilterState, facet: string) {
  const filter = filters.find(isFacetAnyOfFilter(facet));
  return new Set(filter?.type === "categoryOptions" ? filter.value : []);
}

/** Adds the topic to the facet's first "any of" filter, or removes it; other filters stay as they are. */
export function toggleStripeTopic(
  filters: FilterState,
  facet: string,
  topic: string,
): FilterState {
  const selected = selectedStripeTopics(filters, facet);
  if (selected.has(topic)) selected.delete(topic);
  else selected.add(topic);
  const index = filters.findIndex(isFacetAnyOfFilter(facet));
  const next: FilterState[number] = {
    type: "categoryOptions",
    column: "topics",
    key: facet,
    operator: "any of",
    value: [...selected],
  };
  if (index === -1) return selected.size === 0 ? filters : [...filters, next];
  if (selected.size === 0) return filters.filter((_, i) => i !== index);
  return filters.map((filter, i) => (i === index ? next : filter));
}
