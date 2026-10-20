import { type Session } from "next-auth";
import { type FilterState, InvalidRequestError } from "@langfuse/shared";
import {
  getPublishedTopicRun,
  listTopicFacets,
  readCurrentTopicTraceIds,
} from "@langfuse/shared/topics/server";
import { canViewTopics } from "@/src/features/topics/topicsAccess";

/** Sidebar key-value filter: key is the facet name, values are topic names. */
export const TOPIC_FILTER_COLUMN = "topics";

const MAX_TOPIC_FILTER_TRACES = 50_000;
const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 93;

type TopicFilter = Extract<FilterState[number], { type: "categoryOptions" }>;

function isTopicFilter(filter: FilterState[number]): filter is TopicFilter {
  return (
    filter.type === "categoryOptions" && filter.column === TOPIC_FILTER_COLUMN
  );
}

// Summaries start at a trace's first observation, so the lower bound gets a day of slack.
function topicFilterTimeRange(filterState: FilterState) {
  const bounds = filterState.flatMap((filter) =>
    filter.type === "datetime" &&
    (filter.column === "startTime" || filter.column === "Start Time")
      ? [filter]
      : [],
  );
  const upper = bounds.find((filter) => filter.operator.startsWith("<"));
  const lower = bounds.find((filter) => filter.operator.startsWith(">"));
  const to = upper?.value ?? new Date();
  const from = lower
    ? new Date(lower.value.getTime() - DAY_MS)
    : new Date(to.getTime() - MAX_RANGE_DAYS * DAY_MS);
  return { from, to };
}

/** Replaces topic filters with the trace ids whose current topic matches, like comment filters. */
export async function applyTopicFilters({
  filterState,
  projectId,
  session,
}: {
  filterState: FilterState;
  projectId: string;
  session: Session | null;
}): Promise<{ filterState: FilterState; hasNoMatches: boolean }> {
  const topicFilters = filterState.filter(isTopicFilter);
  if (topicFilters.length === 0) return { filterState, hasNoMatches: false };
  if (!canViewTopics(session, projectId))
    throw new InvalidRequestError("Topic filters are not available.");

  const otherFilters = filterState.filter((filter) => !isTopicFilter(filter));
  const timeRange = topicFilterTimeRange(otherFilters);
  const facets = await listTopicFacets(projectId);
  const traceFilters: FilterState = [];
  for (const filter of topicFilters) {
    const facet = facets.find((item) => item.name === filter.key);
    const run = facet ? await getPublishedTopicRun(projectId, facet.id) : null;
    const topicIds = (run?.topics ?? [])
      .filter((topic) => filter.value.includes(topic.name))
      .map((topic) => topic.topicId);
    const traceIds =
      facet && topicIds.length
        ? await readCurrentTopicTraceIds(
            projectId,
            facet.id,
            topicIds,
            timeRange,
            MAX_TOPIC_FILTER_TRACES + 1,
          )
        : [];
    if (traceIds.length > MAX_TOPIC_FILTER_TRACES)
      throw new InvalidRequestError(
        `Topic filter matches more than ${MAX_TOPIC_FILTER_TRACES.toLocaleString("en-US")} traces. Please narrow the time range.`,
      );
    if (traceIds.length === 0) {
      if (filter.operator === "any of")
        return { filterState: otherFilters, hasNoMatches: true };
      continue;
    }
    traceFilters.push({
      type: "stringOptions",
      column: "traceId",
      operator: filter.operator,
      value: traceIds,
    });
  }
  return {
    filterState: [...otherFilters, ...traceFilters],
    hasNoMatches: false,
  };
}
