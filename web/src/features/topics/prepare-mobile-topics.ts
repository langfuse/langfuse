import { type FilterState } from "@langfuse/shared";
import { type Facet, orderedFacetTopics } from "./facet-topics";
import { pickedTopicId, topicTraceQuery } from "./topic-trace-filters";
import { prepareTopicDisplay } from "./prepare-topic-display";

/** Results remain complete even when a topic is too small to label on a chart. */
export function prepareMobileTopics(
  facet: Facet,
  view: "treemap" | "map",
  filters: FilterState,
  searchQuery: string | null,
  showUnassigned: boolean,
) {
  const { topics } = prepareTopicDisplay(facet, view);
  const searchFacet = { name: facet.name, topics: orderedFacetTopics(facet) };
  const selection = pickedTopicId(filters, searchFacet);
  return {
    topics,
    selectedTopicId: selection,
    selectedTopic: topics.find((topic) => topic.id === selection),
    traceQuery: topicTraceQuery(filters, searchQuery, searchFacet, {
      assignedOnly: !showUnassigned,
    }),
  };
}
