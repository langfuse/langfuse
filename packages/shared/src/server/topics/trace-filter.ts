import { type FilterState } from "../../types";
import { InvalidRequestError } from "../../errors";
import { isTopicsProjectEnabled } from "./config";
import { currentTopicTraceIdsCondition } from "./clickhouse";
import { getPublishedTopicMaps, listTopicFacets } from "./postgres";

/** Tracing filter column: key is the facet name, values are topic names. */
export const TOPIC_FILTER_COLUMN = "topics";

const DAY_MS = 86_400_000;

type TopicFilter = Extract<FilterState[number], { type: "categoryOptions" }>;

export function isTopicFilter(
  filter: FilterState[number],
): filter is TopicFilter {
  return (
    filter.type === "categoryOptions" && filter.column === TOPIC_FILTER_COLUMN
  );
}

// Summaries start at a trace's first observation, so the lower bound gets a day of slack.
function topicTimeRange(filter: FilterState) {
  const bounds = filter.flatMap((condition) =>
    condition.type === "datetime" &&
    (condition.column === "startTime" || condition.column === "Start Time")
      ? [condition]
      : [],
  );
  const lower = bounds.find((condition) => condition.operator.startsWith(">"));
  const upper = bounds.find((condition) => condition.operator.startsWith("<"));
  return {
    from: lower ? new Date(lower.value.getTime() - DAY_MS) : new Date(0),
    to: new Date((upper?.value ?? new Date()).getTime() + 1),
  };
}

/**
 * Turns topic filters into ClickHouse conditions on the events query, so membership is
 * resolved inside the same query instead of shipping trace ids. Names map to stable topic
 * ids through each facet's current published map.
 */
export async function topicFilterConditions(
  projectId: string,
  filter: FilterState,
) {
  const topicFilters = filter.filter(isTopicFilter);
  if (topicFilters.length === 0) return [];
  if (!isTopicsProjectEnabled(projectId))
    throw new InvalidRequestError("Topic filters are not available.");

  const [facets, { runIds, maps }] = await Promise.all([
    listTopicFacets(projectId),
    getPublishedTopicMaps(projectId),
  ]);
  const timeRange = topicTimeRange(filter);
  return topicFilters.flatMap((topicFilter, index) => {
    const facet = facets.find((item) => item.name === topicFilter.key);
    const topicIds = (
      maps.find((map) => map.facetId === facet?.id)?.topics ?? []
    )
      .filter((topic) => topicFilter.value.includes(topic.name))
      .map((topic) => topic.topicId);
    const negated = topicFilter.operator === "none of";
    if (!facet || topicIds.length === 0)
      return negated ? [] : [{ query: "0 = 1", params: {} }];
    return [
      currentTopicTraceIdsCondition(`topicFilter${index}`, {
        projectId,
        facetId: facet.id,
        topicIds,
        publishedRunIds: runIds,
        timeRange,
        negated,
      }),
    ];
  });
}
