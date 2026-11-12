import { type FilterState } from "../../types";
import { isTopicFilter, TOPICS_MAX_TIME_RANGE_MS } from "../../topics";
import { InvalidRequestError } from "../../errors/InvalidRequestError";
import { isTopicsProjectEnabled } from "./config";
import {
  currentTopicTraceIdsCondition,
  TRACE_START_SLACK_MS,
} from "./clickhouse";
import { getPublishedTopicMaps, listTopicFacets } from "./postgres";

// Topic filters follow the table window like score filters; longer or open windows are rejected.
// Summaries start at a trace's first observation, so the lookup's lower bound gets the trace slack.
function topicTimeRange(filter: FilterState) {
  const bounds = filter.flatMap((condition) =>
    condition.type === "datetime" &&
    (condition.column === "startTime" || condition.column === "Start Time")
      ? [condition]
      : [],
  );
  // The events query ANDs every bound, so the tightest ones define the window.
  const times = (prefix: string) =>
    bounds
      .filter((condition) => condition.operator.startsWith(prefix))
      .map((condition) => condition.value.getTime());
  const lowers = times(">");
  const uppers = times("<");
  const to = (uppers.length ? Math.min(...uppers) : Date.now()) + 1;
  const from = lowers.length ? Math.max(...lowers) : undefined;
  if (from !== undefined && from >= to) return null;
  if (from === undefined || to - from > TOPICS_MAX_TIME_RANGE_MS)
    throw new InvalidRequestError(
      "Topic filters cover at most 93 days. Pick a shorter time range.",
    );
  return { from: new Date(from - TRACE_START_SLACK_MS), to: new Date(to) };
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

  const timeRange = topicTimeRange(filter);
  // Non-overlapping date filters match no trace, so skip the lookup.
  if (!timeRange)
    return topicFilters.flatMap((topicFilter) =>
      topicFilter.operator === "none of"
        ? []
        : [{ query: "0 = 1", params: {} as Record<string, unknown> }],
    );

  const facets = (await listTopicFacets(projectId)).filter((facet) =>
    topicFilters.some((topicFilter) => topicFilter.key === facet.name),
  );
  const { runIds, maps } = await getPublishedTopicMaps(
    projectId,
    facets.map((facet) => facet.id),
  );
  return topicFilters.flatMap((topicFilter, index) => {
    const facet = facets.find((item) => item.name === topicFilter.key);
    // Rules map a facet separately; a name matches in any of them.
    const topicIds = maps
      .filter((map) => map.facetId === facet?.id)
      .flatMap((map) => map.topics)
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
