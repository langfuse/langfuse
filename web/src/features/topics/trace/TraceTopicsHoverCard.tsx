import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  topicBadgeColor,
  topicColor,
} from "@/src/features/topics/topic-map-colors";
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

function TopicDot({ topicIndex }: { topicIndex: number }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: topicColor(topicIndex) }}
    />
  );
}

function TopicChip({ name, topicIndex }: { name: string; topicIndex: number }) {
  return (
    <BadgeShell color={topicBadgeColor(topicIndex)}>
      <TopicDot topicIndex={topicIndex} />
      <span className="truncate" title={name}>
        {name}
      </span>
    </BadgeShell>
  );
}

/** Trace header: the trace's first topic, with a hover card listing every facet result. */
export function TraceTopicsHoverCard({
  projectId,
  facets,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
}) {
  const assigned = facets.filter((facet) => facet.topicName);
  const lead = assigned[0];
  return (
    <HoverCard
      openDelay={200}
      placement="bottom-start"
      content={
        <div className="flex w-96 flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <span className="text-sm font-bold">Topics</span>
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/topics`}
              value="Open in Topics"
            />
          </div>
          {facets.map((facet) => (
            <div
              key={facet.facetId}
              className="flex flex-col gap-1.5 border-b px-4 py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-sm">
                  {facet.name}
                </span>
                {facet.topicName ? (
                  <TopicChip
                    name={facet.topicName}
                    topicIndex={facet.topicIndex}
                  />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {facet.outcome.replaceAll("_", " ")}
                  </span>
                )}
              </div>
              {facet.topicName && facet.summary && (
                <p className="text-sm">{facet.summary}</p>
              )}
            </div>
          ))}
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span className="inline-flex" {...getTriggerProps()}>
          {lead?.topicName ? (
            <BadgeShell color="ghost">
              <TopicDot topicIndex={lead.topicIndex} />
              <span className="truncate" title={lead.topicName}>
                {lead.topicName}
              </span>
              {assigned.length > 1 && (
                <span className="text-muted-foreground">
                  +{assigned.length - 1}
                </span>
              )}
            </BadgeShell>
          ) : (
            <Badge color="ghost" text="No topics" />
          )}
        </span>
      )}
    </HoverCard>
  );
}
