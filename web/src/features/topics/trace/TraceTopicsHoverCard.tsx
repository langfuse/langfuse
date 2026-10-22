import { Badge } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { TopicBadge } from "@/src/features/topics/TopicBadge";
import { topicBadgeColor } from "@/src/features/topics/topic-map-colors";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { api, type RouterOutputs } from "@/src/utils/api";

type TraceTopicFacet = RouterOutputs["topics"]["forTrace"][number];

/** Facet results of a trace; empty when Topics is unavailable or nothing was summarized. */
export function useTraceTopicFacets(trace: {
  projectId: string;
  id: string;
  timestamp: Date;
}) {
  const canViewTopics = useCanViewTopics(trace.projectId);
  return (
    api.topics.forTrace.useQuery(
      {
        projectId: trace.projectId,
        traceId: trace.id,
        timestamp: trace.timestamp,
      },
      { enabled: canViewTopics, staleTime: 60 * 1000 },
    ).data ?? []
  );
}

/** Trace header: a "topics" count badge whose hover card lists every facet summary of the trace. */
export function TraceTopicsHoverCard({
  projectId,
  facets,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
}) {
  return (
    <HoverCard
      openDelay={200}
      placement="bottom-start"
      content={
        <div className="flex w-96 flex-col">
          {facets.map((facet) => (
            <div
              key={facet.facetId}
              className="flex flex-col gap-1.5 border-b px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground pt-0.5 text-xs font-bold uppercase">
                  {facet.name}
                </span>
                <TopicBadge
                  row={facet}
                  color={topicBadgeColor(facet.topicIndex)}
                  size="sm"
                />
              </div>
              <p className="text-foreground-secondary text-xs">
                {facet.summary}
              </p>
            </div>
          ))}
          <div className="bg-muted/50 px-3 py-2">
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/topics`}
              value="Open Topics"
            />
          </div>
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span className="inline-flex" {...getTriggerProps()}>
          <Badge
            color="ghost"
            font="mono"
            label="topics"
            text={String(facets.filter((facet) => facet.topicName).length)}
          />
        </span>
      )}
    </HoverCard>
  );
}
