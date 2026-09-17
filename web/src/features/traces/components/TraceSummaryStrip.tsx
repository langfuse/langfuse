/** Trace totals, session/user links and tags, above the panels. */

import { useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { SessionBadge, UserIdBadge } from "./TraceMetadataBadges";
import { LatencyBadge } from "./ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import { CostBadge, UsageBadge } from "./ObservationMetadataBadgesTooltip";
import { useTraceData } from "../contexts/TraceDataContext";
import { aggregateTraceMetrics } from "../fns/traceAggregation";

const MAX_VISIBLE_TAGS = 3;

export function TraceSummaryStrip() {
  const { trace, observations } = useTraceData();
  const [showAllTags, setShowAllTags] = useState(false);

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  const visibleTags = showAllTags
    ? trace.tags
    : trace.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = trace.tags.length - visibleTags.length;

  return (
    <div className="shrink-0 border-b px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        <LatencyBadge latencySeconds={trace.latency ?? null} />
        {aggregatedMetrics.totalCost != null &&
          aggregatedMetrics.costDetails && (
            <CostBadge
              totalCost={aggregatedMetrics.totalCost}
              costDetails={aggregatedMetrics.costDetails}
            />
          )}
        {aggregatedMetrics.hasGenerationLike &&
          aggregatedMetrics.usageDetails && (
            <UsageBadge
              inputUsage={aggregatedMetrics.inputUsage}
              outputUsage={aggregatedMetrics.outputUsage}
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
