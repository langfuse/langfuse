import { Badge } from "@/src/components/design-system/Badge/Badge";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { type TraceTopicFacet } from "./useTraceTopics";
import { TopicBadge } from "@/src/features/topics/TopicBadge";
import { topicBadgeColor } from "@/src/features/topics/topic-map-colors";
import { topicTracesHref } from "./topicLinks";

/** Header variant 1k: one "topics" badge, every facet summary in its hover card. */
export function TraceTopicsHoverCard({
  projectId,
  facets,
  onOpenTopicsTab,
}: {
  projectId: string;
  facets: TraceTopicFacet[];
  onOpenTopicsTab: () => void;
}) {
  const assignedCount = facets.filter((facet) => facet.topic).length;
  return (
    <HoverCard
      openDelay={200}
      placement="bottom-start"
      content={
        <div className="flex w-96 flex-col">
          {facets.map((facet, index) => (
            <div
              key={facet.facetId}
              className="flex flex-col gap-1.5 border-b px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground pt-0.5 text-xs font-bold uppercase">
                  {facet.name}
                </span>
                <TopicBadge
                  row={{
                    topicName: facet.topic?.name ?? null,
                    outcome: facet.outcome,
                  }}
                  color={facet.topic ? topicBadgeColor(index) : "primary"}
                  size="sm"
                />
              </div>
              <p className="text-foreground-secondary text-xs">
                {facet.summary}
              </p>
              {facet.topic && (
                <TextLink
                  path={topicTracesHref(
                    projectId,
                    facet.name,
                    facet.topic.name,
                  )}
                  value="Filter traces"
                />
              )}
            </div>
          ))}
          <div className="bg-muted/50 px-3 py-2">
            <TextLink
              path=""
              value="Open Topics tab"
              onClick={onOpenTopicsTab}
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
            text={String(assignedCount)}
          />
        </span>
      )}
    </HoverCard>
  );
}
