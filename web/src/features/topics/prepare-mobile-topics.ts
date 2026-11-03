import { type FilterState } from "@langfuse/shared";
import { type Facet } from "./facet-topics";
import { filterTopicTraces } from "./topic-trace-filters";
import {
  prepareTopicDisplay,
  UNASSIGNED_TOPIC_ID,
} from "./prepare-topic-display";
import { type TopicsResultsView } from "./TopicsResultsViewSelect";

function selectedTopicId(filters: FilterState) {
  const filter = filters.length === 1 ? filters[0] : undefined;
  if (filter?.type !== "stringOptions" || filter.value.length !== 1)
    return null;
  if (filter.column === "topicId" && filter.operator === "any of")
    return filter.value[0];
  if (
    filter.column === "assignment" &&
    filter.operator === "none of" &&
    filter.value[0] === "assigned"
  )
    return UNASSIGNED_TOPIC_ID;
  return null;
}

/** Results remain complete even when a topic is too small to label on a chart. */
export function prepareMobileTopics(
  facet: Facet,
  view: TopicsResultsView,
  filters: FilterState,
  searchQuery: string | null,
) {
  const { topics } = prepareTopicDisplay(facet, view);
  const selection = selectedTopicId(filters);
  const visible = filterTopicTraces(facet.rows, filters, searchQuery);
  return {
    topics,
    selectedTopicId: selection,
    selectedTopic: topics.find((topic) => topic.id === selection),
    visible,
  };
}
