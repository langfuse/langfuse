/**
 * TraceSummaryStrip - persistent trace-level summary row.
 *
 * Renders directly under the page header, above the navigation/detail panels,
 * and stays visible regardless of which observation is selected. It carries
 * trace totals (latency, cost, tokens), the session/user reference links, and
 * tags. Env/release/version stay on the trace detail header instead, since
 * observations can differ from the trace.
 *
 * Totals are shuffled, not computed: latency comes from the tRPC trace payload
 * (server-derived from observation timestamps) and cost from the same
 * client-side aggregation the trace detail header already used.
 */

import { useMemo, useState } from "react";

import { Button } from "@/src/components/ui/button";
import { useIsMobile } from "@/src/hooks/use-mobile";
import { TagButton } from "@/src/features/tag/components/TagButton";
import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  UsageBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";

// Tags shown before the rest folds into a "+N" toggle — tag-heavy traces must
// not turn the one-line strip into a wall of chips.
const MAX_VISIBLE_TAGS = 3;

export function TraceSummaryStrip() {
  const { trace, observations } = useTraceData();
  const isMobile = useIsMobile();
  const [showAllTags, setShowAllTags] = useState(false);

  const aggregatedMetrics = useMemo(
    () => aggregateTraceMetrics(observations),
    [observations],
  );

  // Mobile clips the whole row behind CollapsibleBadgeRow's chevron, so a +N
  // here would reveal nothing. Cap on desktop only.
  const visibleTags =
    isMobile || showAllTags
      ? trace.tags
      : trace.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTagCount = trace.tags.length - visibleTags.length;

  return (
    <div className="shrink-0 border-b px-3 py-2">
      <CollapsibleBadgeRow>
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
            {/* v4 tags are immutable here, so no edit affordance. */}
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
      </CollapsibleBadgeRow>
    </div>
  );
}
