import { Button } from "@/src/components/design-system/Button/Button";
import { OverflowCountBadge } from "@/src/components/OverflowCountBadge";
/** Trace totals, session/user links and tags, above the panels. */

import { useMemo, useState, type ReactNode } from "react";

import { GroupedScoreBadges } from "@/src/components/GroupedScoreBadges";
import { BadgeShell } from "@/src/components/design-system/Badge/Badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TagList } from "@/src/features/tag";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/LatencyBadge";
import {
  CostBadge,
  UsageBadge,
  hasBreakdown,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesProvider";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { cn } from "@/src/utils/tailwind";
import {
  TraceTopicsHoverCard,
  useTraceTopicFacets,
} from "@/src/features/topics/trace/TraceTopicsHoverCard";

const MAX_VISIBLE_TAGS = 3;

const LOADING_BADGE_WIDTHS = ["w-16", "w-14", "w-24", "w-20", "w-40"];

export function TraceHeader({ isLoading = false }: { isLoading?: boolean }) {
  if (isLoading) return <TraceHeaderLoading />;
  return <LoadedTraceHeader />;
}

function TraceHeaderFrame({ children }: { children: ReactNode }) {
  const { traceContext } = useViewPreferences();
  return (
    <div
      className={cn(
        "shrink-0 border-b",
        traceContext === "fullscreen" && "px-4 pt-1 pb-1.5",
        // Peek's title bar already pads above, so no top padding here.
        traceContext === "peek" && "pt-0 pr-2 pb-2 pl-4",
        traceContext !== "fullscreen" && traceContext !== "peek" && "px-2 py-2",
      )}
    >
      {children}
    </div>
  );
}

function TraceHeaderLoading() {
  return (
    <TraceHeaderFrame>
      <CollapsibleBadgeRow>
        {LOADING_BADGE_WIDTHS.map((width) => (
          <BadgeShell key={width} color="ghost">
            <Skeleton className={cn("h-3", width)} />
          </BadgeShell>
        ))}
      </CollapsibleBadgeRow>
    </TraceHeaderFrame>
  );
}

function LoadedTraceHeader() {
  const { trace, observations, mergedScores } = useTraceData();
  const [showAllTags, setShowAllTags] = useState(false);
  const topicFacets = useTraceTopicFacets(trace);
  const handleShowFewerTags = () => {
    setShowAllTags(false);
  };

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const traceScores = useMemo(
    () => mergedScores.filter((score) => score.observationId === null),
    [mergedScores],
  );

  const visibleTags = showAllTags
    ? trace.tags
    : trace.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = trace.tags.length - visibleTags.length;

  return (
    <TraceHeaderFrame>
      <CollapsibleBadgeRow>
        {trace.latency != null && (
          <LatencyBadge latencySeconds={trace.latency} />
        )}
        {aggregatedMetrics.totalCost != null &&
          aggregatedMetrics.costDetails && (
            <CostBadge
              totalCost={aggregatedMetrics.totalCost}
              costDetails={aggregatedMetrics.costDetails}
            />
          )}
        {aggregatedMetrics.hasGenerationLike &&
          aggregatedMetrics.totalUsage > 0 &&
          aggregatedMetrics.usageDetails &&
          hasBreakdown(aggregatedMetrics.usageDetails) && (
            <UsageBadge
              totalUsage={aggregatedMetrics.totalUsage}
              usageDetails={aggregatedMetrics.usageDetails}
            />
          )}
        {trace.sessionId && (
          <SessionBadge
            sessionId={trace.sessionId}
            projectId={trace.projectId}
          />
        )}
        {trace.userId && (
          <UserIdBadge userId={trace.userId} projectId={trace.projectId} />
        )}
        {topicFacets.some((facet) => facet.summary) && (
          <TraceTopicsHoverCard
            projectId={trace.projectId}
            facets={topicFacets}
          >
            {(triggerProps) => (
              <TraceTopicsHoverCard.Trigger
                facets={topicFacets}
                triggerProps={triggerProps}
              />
            )}
          </TraceTopicsHoverCard>
        )}
        {(traceScores.length > 0 || trace.tags.length > 0) && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {traceScores.length > 0 && (
              <GroupedScoreBadges scores={traceScores} />
            )}
            <TagList selectedTags={visibleTags} isLoading={false} viewOnly />
            {hiddenTagCount > 0 && (
              <OverflowCountBadge
                count={hiddenTagCount}
                aria-label={`Show ${hiddenTagCount} more tags`}
                onClick={() => setShowAllTags(true)}
              />
            )}
            {showAllTags && trace.tags.length > MAX_VISIBLE_TAGS && (
              <Button
                variant="text"
                size="sm"
                text="Show fewer"
                onClick={handleShowFewerTags}
              />
            )}
          </div>
        )}
      </CollapsibleBadgeRow>
    </TraceHeaderFrame>
  );
}
