import { encodeFiltersGeneric, type FilterState } from "@langfuse/shared";

/** Root observations whose trace currently belongs to the topic. */
export function topicTracesHref(
  projectId: string,
  facetName: string,
  topicName: string,
) {
  const filter: FilterState = [
    {
      column: "topics",
      type: "categoryOptions",
      key: facetName,
      operator: "any of",
      value: [topicName],
    },
    {
      column: "isRootObservation",
      type: "boolean",
      operator: "=",
      value: true,
    },
  ];
  return `/project/${encodeURIComponent(projectId)}/traces?dateRange=7d&filter=${encodeURIComponent(encodeFiltersGeneric(filter))}`;
}

export function topicsPageHref(projectId: string, facetId: string) {
  return `/project/${encodeURIComponent(projectId)}/topics?topicFacet=${encodeURIComponent(facetId)}`;
}
