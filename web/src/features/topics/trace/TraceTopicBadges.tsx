import { LinkBadge } from "@/src/components/design-system/LinkBadge/LinkBadge";
import { type TraceTopicFacet } from "./useTraceTopics";
import { topicsPageHref } from "./topicLinks";

/** Header variant 1j: one key-value link badge per facet with a topic. */
export function TraceTopicBadges({
  projectId,
  facets,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
}) {
  return facets.flatMap((facet) =>
    facet.topic
      ? [
          <LinkBadge
            key={facet.facetId}
            href={topicsPageHref(projectId, facet.facetId)}
            label={facet.name.toLowerCase()}
            text={facet.topic.name}
            title={facet.topic.description}
          />,
        ]
      : [],
  );
}
