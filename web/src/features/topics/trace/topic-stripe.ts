import { type FilterState } from "@langfuse/shared";
import { isTopicFilter } from "@langfuse/shared/topics";

/** Topics past this many fold into one grey segment. */
/** @internal */
export const TOPIC_STRIPE_SLOTS = 16;

type TraceTopics = Record<
  string,
  {
    facet: string;
    topicId: string | null;
    topic: string | null;
    runIds: string[];
  }[]
>;

/** The one map the stripe counts. */
export type TopicStripeMap = { runId: string };

export type TopicStripeSegment =
  /** `slot` is the topic's rank in the loaded rows, largest first; the colour follows it. */
  | {
      kind: "topic";
      topicId: string;
      name: string;
      count: number;
      slot: number;
    }
  | { kind: "more"; count: number; topicCount: number }
  | { kind: "unassigned"; count: number };

/** Intent when the project has it, else the first facet. */
export function topicStripeFacet(facets: string[]) {
  return (
    facets.find((name) => name.toLowerCase() === "intent") ?? facets[0] ?? null
  );
}

const distinctTraceIds = (rows: { traceId?: string | null }[]) =>
  new Set(rows.flatMap((row) => row.traceId ?? []));

/** The trace's topic in the map, null for an outlier, undefined when the map never analysed it; other maps are ignored. */
function mapResult(
  topicsByTrace: TraceTopics,
  traceId: string,
  facet: string,
  map: TopicStripeMap,
) {
  return topicsByTrace[traceId]?.find(
    (item) => item.facet === facet && item.runIds.includes(map.runId),
  );
}

/** Distinct traces in the rows, and how many of them the map analysed, outliers included. */
export function topicStripeCoverage({
  rows,
  topicsByTrace,
  facet,
  map,
}: {
  rows: { traceId?: string | null }[];
  topicsByTrace: TraceTopics;
  facet: string;
  map: TopicStripeMap;
}) {
  const traceIds = distinctTraceIds(rows);
  const analysed = [...traceIds].filter(
    (traceId) => mapResult(topicsByTrace, traceId, facet, map) !== undefined,
  ).length;
  return { analysed, total: traceIds.size };
}

/** Distinct traces per topic of one facet's map, largest first; then the folded tail and unassigned traces. */
export function topicStripeSegments({
  rows,
  topicsByTrace,
  facet,
  map,
}: {
  rows: { traceId?: string | null }[];
  topicsByTrace: TraceTopics;
  facet: string;
  map: TopicStripeMap;
}): TopicStripeSegment[] {
  const counts = new Map<string, { name: string; count: number }>();
  let unassigned = 0;
  for (const traceId of distinctTraceIds(rows)) {
    const entry = mapResult(topicsByTrace, traceId, facet, map);
    if (!entry?.topicId || !entry.topic) unassigned++;
    else {
      const existing = counts.get(entry.topicId);
      counts.set(entry.topicId, {
        name: entry.topic,
        count: (existing?.count ?? 0) + 1,
      });
    }
  }
  const topics = [...counts]
    .sort(
      ([aId, a], [bId, b]) =>
        b.count - a.count ||
        a.name.localeCompare(b.name) ||
        aId.localeCompare(bId),
    )
    .map(([topicId, { name, count }], slot) => ({
      kind: "topic" as const,
      topicId,
      name,
      count,
      slot,
    }));
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

type StripeTopicIdentity = { topicId: string; name: string };

/**
 * Resolves each entry in the facet's "any of" filter to stable topic IDs when
 * it matches a known topic's ID or legacy name, leaving unknown entries intact.
 */
function resolveStripeFilterValues(
  values: readonly string[],
  topics: readonly StripeTopicIdentity[],
): Set<string> {
  if (topics.length === 0) return new Set(values);
  const knownIds = new Set(topics.map((topic) => topic.topicId));
  const idsByName = new Map<string, string[]>();
  for (const topic of topics) {
    const existing = idsByName.get(topic.name);
    if (existing) existing.push(topic.topicId);
    else idsByName.set(topic.name, [topic.topicId]);
  }
  const resolved = new Set<string>();
  for (const value of values) {
    if (knownIds.has(value)) {
      resolved.add(value);
      continue;
    }
    const matchingIds = idsByName.get(value);
    if (matchingIds) {
      for (const id of matchingIds) resolved.add(id);
    } else {
      resolved.add(value);
    }
  }
  return resolved;
}

/** Topics picked in the facet's "any of" filter (resolving legacy names when stripe topics are known). */
export function selectedStripeTopics(
  filters: FilterState,
  facet: string,
  topics: readonly StripeTopicIdentity[] = [],
) {
  const filter = filters.find(isFacetAnyOfFilter(facet));
  return resolveStripeFilterValues(
    filter?.type === "categoryOptions" ? filter.value : [],
    topics,
  );
}

/** Adds the topic to the facet's first "any of" filter, or removes it; other filters and untouched legacy values stay as they are. */
export function toggleStripeTopic(
  filters: FilterState,
  facet: string,
  topic: string,
  topics: readonly StripeTopicIdentity[] = [],
): FilterState {
  const index = filters.findIndex(isFacetAnyOfFilter(facet));
  const rawValues =
    index !== -1 && filters[index]?.type === "categoryOptions"
      ? filters[index].value
      : [];
  const selected = resolveStripeFilterValues(rawValues, topics);
  let nextValues: string[];

  if (!selected.has(topic)) {
    // Adding a topic preserves all existing entries (including legacy names) as-is.
    nextValues = [...rawValues, topic];
  } else {
    const clickedNames = new Set(
      topics.filter((item) => item.topicId === topic).map((item) => item.name),
    );
    const seen = new Set<string>();
    const add = (value: string) => {
      if (seen.has(value)) return;
      seen.add(value);
      nextValues.push(value);
    };
    nextValues = [];
    for (const entry of rawValues) {
      if (entry === topic) continue;
      if (clickedNames.has(entry)) {
        for (const item of topics) {
          if (item.name === entry && item.topicId !== topic) add(item.topicId);
        }
        continue;
      }
      add(entry);
    }
  }

  const next: FilterState[number] = {
    type: "categoryOptions",
    column: "topics",
    key: facet,
    operator: "any of",
    value: nextValues,
  };
  if (index === -1)
    return nextValues.length === 0 ? filters : [...filters, next];
  if (nextValues.length === 0) return filters.filter((_, i) => i !== index);
  return filters.map((filter, i) => (i === index ? next : filter));
}
