import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  treemapBadgeColor,
  treemapSwatchColor,
} from "@/src/features/topics/topic-map-colors";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { useState } from "react";
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

/** Outcome without a summary, e.g. "not_applicable" as "Not applicable". */
function outcomeLabel(outcome: string) {
  const text = outcome.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Treemap hue, nudged toward the text color so it reads on the chip tint. */
function TopicDot({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-xs"
      style={{
        backgroundColor: `color-mix(in oklch, ${treemapSwatchColor(rank)} 65%, hsl(var(--foreground)))`,
      }}
    />
  );
}

/** Rank and trace count per topic over the last 7 days, the Topics page default; ranks pick the treemap color. */
function useTopicRanks(projectId: string, enabled: boolean) {
  const [timeRange] = useState(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - 7 * 86_400_000), to };
  });
  const results = api.topics.currentResults.useQuery(
    { projectId, timeRange },
    { enabled, staleTime: 5 * 60 * 1000 },
  );
  return (facetId: string, topicId: string) => {
    const topics =
      results.data?.facets.find((facet) => facet.facetId === facetId)?.topics ??
      [];
    const rank = topics.findIndex((topic) => topic.id === topicId);
    return { rank, count: rank < 0 ? null : topics[rank].count };
  };
}

function TopicChip({
  name,
  rank,
  count,
}: {
  name: string;
  rank: number;
  count: number | null;
}) {
  return (
    <span className="flex min-w-0">
      <BadgeShell color={treemapBadgeColor(rank)} font="mono">
        <TopicDot rank={rank} />
        <span className="truncate" title={name}>
          {name}
        </span>
        {count !== null && (
          <span className="text-muted-foreground shrink-0">{count}</span>
        )}
      </BadgeShell>
    </span>
  );
}

/** Trace header: the trace's first topic, with a card listing every facet result. */
export function TraceTopicsHoverCard({
  projectId,
  facets,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
}) {
  const rankOf = useTopicRanks(projectId, facets.length > 0);
  const assigned = facets.filter((facet) => facet.topicId && facet.topicName);
  const lead = assigned[0];
  const leadRank =
    lead?.topicId != null ? rankOf(lead.facetId, lead.topicId).rank : -1;
  return (
    <HoverCard
      openDelay={200}
      placement="bottom-end"
      content={
        <div className="flex max-h-[70vh] w-120 flex-col overflow-y-auto px-4">
          <div className="flex items-center justify-between gap-2 border-b py-2.5">
            <span className="text-muted-foreground text-sm">Topics</span>
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/topics`}
              value="Open in Topics"
            />
          </div>
          {facets.map((facet) => {
            const topic =
              facet.topicId && facet.topicName
                ? {
                    name: facet.topicName,
                    ...rankOf(facet.facetId, facet.topicId),
                  }
                : null;
            return (
              <div
                key={facet.facetId}
                className="flex flex-col gap-1.5 border-b py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="shrink-0 text-sm font-bold">
                    {facet.name}
                  </span>
                  {topic && (
                    <TopicChip
                      name={topic.name}
                      rank={topic.rank}
                      count={topic.count}
                    />
                  )}
                  {!facet.summary && (
                    <span className="text-muted-foreground text-sm">
                      {facet.outcome
                        ? outcomeLabel(facet.outcome)
                        : "Not analyzed yet"}
                    </span>
                  )}
                </div>
                {facet.summary && (
                  <p className="text-muted-foreground text-sm text-pretty">
                    {facet.summary}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      }
    >
      {({ getTriggerProps }) => (
        <span
          className="hover:bg-muted inline-flex min-w-0 cursor-pointer rounded-sm px-2"
          {...getTriggerProps()}
        >
          {lead?.topicName ? (
            <BadgeShell color="ghost" font="mono">
              <TopicDot rank={leadRank} />
              <span className="truncate" title={lead.topicName}>
                {lead.topicName}
              </span>
              {assigned.length > 1 && (
                <span className="text-muted-foreground shrink-0">
                  +{assigned.length - 1}
                </span>
              )}
            </BadgeShell>
          ) : (
            <Badge color="ghost" font="mono" text="Topics" title="" />
          )}
        </span>
      )}
    </HoverCard>
  );
}
