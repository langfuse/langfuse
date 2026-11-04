import { Badge, BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import {
  treemapBadgeColor,
  treemapSwatchColor,
} from "@/src/features/topics/topic-map-colors";
import { useCanViewTopics } from "@/src/features/topics/topicsAccess";
import { type ReactNode } from "react";
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

/** Map hue, nudged toward the text color so it reads on the chip tint. */
function TopicDot({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-xs"
      style={{
        backgroundColor: `color-mix(in oklch, ${treemapSwatchColor(rank)} 80%, hsl(var(--foreground)))`,
      }}
    />
  );
}

/** Topic chip colored by the topic's slot in the published map. */
function TopicChip({ name, mapIndex }: { name: string; mapIndex: number }) {
  return (
    <span className="flex min-w-0">
      <BadgeShell color={treemapBadgeColor(mapIndex)}>
        <TopicDot rank={mapIndex} />
        <span className="truncate" title={name}>
          {name}
        </span>
      </BadgeShell>
    </span>
  );
}

/** Trace header trigger: the trace's first topic and how many more it has. */
function TraceTopicsTrigger({
  facets,
  triggerProps,
}: {
  facets: TraceTopicFacet[];
  triggerProps: Record<string, unknown>;
}) {
  const assigned = facets.filter((facet) => facet.topicName);
  const lead = assigned[0];
  return (
    <span
      className="ph-no-capture hover:bg-muted inline-flex min-w-0 cursor-pointer rounded-sm px-2"
      {...triggerProps}
    >
      {lead?.topicName ? (
        <BadgeShell color="ghost" font="mono">
          <TopicDot rank={lead.topicIndex} />
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
  );
}

/** Card listing every facet result of a trace; the caller renders the trigger. */
export function TraceTopicsHoverCard({
  projectId,
  facets,
  children,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
  children: (triggerProps: Record<string, unknown>) => ReactNode;
}) {
  return (
    <HoverCard
      openDelay={200}
      placement="bottom-end"
      content={
        <div className="ph-no-capture flex max-h-[70vh] w-120 flex-col overflow-y-auto px-4">
          <div className="flex items-center justify-between gap-2 border-b py-2.5">
            <span className="text-sm font-bold">Topics</span>
            <TextLink
              path={`/project/${encodeURIComponent(projectId)}/topics`}
              value="Open in Topics →"
            />
          </div>
          {facets.map((facet) => (
            <div
              key={facet.facetId}
              className="flex flex-col gap-1.5 border-b py-3 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground shrink-0 text-sm">
                  {facet.name}
                </span>
                {facet.topicName && (
                  <TopicChip
                    name={facet.topicName}
                    mapIndex={facet.topicIndex}
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
                <p className="text-sm text-pretty">{facet.summary}</p>
              )}
            </div>
          ))}
        </div>
      }
    >
      {({ getTriggerProps }) => children(getTriggerProps())}
    </HoverCard>
  );
}

TraceTopicsHoverCard.Trigger = TraceTopicsTrigger;
