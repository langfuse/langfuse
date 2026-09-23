/** Trace totals, session/user links and tags, above the panels. */

import { useMemo, useState } from "react";

import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  UsageBadge,
  hasBreakdown,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";

const MAX_VISIBLE_TAGS = 3;

export function TraceHeader() {
  const { trace, observations, mergedScores } = useTraceData();
  const [showAllTags, setShowAllTags] = useState(false);

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
    <div className="shrink-0 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <LatencyBadge latencySeconds={trace.latency ?? null} />
        {aggregatedMetrics.totalCost != null &&
          aggregatedMetrics.costDetails && (
            <CostBadge
              totalCost={aggregatedMetrics.totalCost}
              costDetails={aggregatedMetrics.costDetails}
            />
          )}
        {aggregatedMetrics.hasGenerationLike &&
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
        {traceScores.length > 0 && <GroupedScoreBadges scores={traceScores} />}
        {trace.tags.length > 0 && (
          <div className="flex min-w-0 items-center gap-1">
            {visibleTags.map((tag) => (
              <TagButton key={tag} tag={tag} loading={false} viewOnly />
            ))}
            {hiddenTagCount > 0 && (
              <Button
                variant="tertiary"
                size="icon-sm"
                className="w-fit"
                aria-label={`Show ${hiddenTagCount} more tags`}
                onClick={() => setShowAllTags(true)}
              >
                +{hiddenTagCount}
              </Button>
            )}
            {showAllTags && trace.tags.length > MAX_VISIBLE_TAGS && (
              <Button
                variant="tertiary"
                size="icon-sm"
                className="w-fit"
                aria-label="Show fewer tags"
                onClick={() => setShowAllTags(false)}
              >
                Show fewer
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
