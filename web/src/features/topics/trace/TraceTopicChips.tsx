import { Tag } from "@/src/components/design-system/Tag/Tag";
import { type TraceTopicFacet } from "./useTraceTopics";

/** Table cell (1a): one tag per facet whose summary belongs to a topic, on one line like Trace Tags. */
export function TraceTopicChips({ facets }: { facets: TraceTopicFacet[] }) {
  return (
    <div className="flex gap-x-2 overflow-hidden">
      {facets.flatMap((facet) =>
        facet.topic
          ? [
              <Tag
                key={facet.facetId}
                text={`${facet.name.toLowerCase()}: ${facet.topic.name}`}
              />,
            ]
          : [],
      )}
    </div>
  );
}
