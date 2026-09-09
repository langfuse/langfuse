/**
 * TraceSummaryStrip - persistent trace-level summary row.
 *
 * Renders directly under the page header, above the navigation/detail panels,
 * and stays visible regardless of which observation is selected. It carries
 * only trace totals (latency, cost, tokens), the session/user reference
 * links, and tags — env/release/version live in the detail headers instead
 * (trace-level values on TraceDetailViewHeader, observation-level values on
 * ObservationDetailViewHeader), since observations can differ from the
 * trace.
 *
 * Totals are shuffled, not computed: latency comes from the tRPC trace payload
 * (server-derived from observation timestamps) and cost from the same
 * client-side aggregation the detail header already used.
 */

import { useMemo, useState } from "react";

import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { TagPill } from "@/src/features/tag/components/TagPill";
import { ModernSessionHeaderPill } from "@/src/components/session/ModernSessionHeaderPill";
import {
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  getCompactUsageTotal,
  UsageBadge,
} from "@/src/features/traces/components/ObservationMetadataBadgesTooltip";
import { aggregateTraceMetrics } from "@/src/features/traces/fns/traceAggregation";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";

// Tags shown before the rest folds into a "+N" toggle — tag-heavy traces must
// not turn the one-line strip into a wall of chips.
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
          aggregatedMetrics.usageDetails &&
          getCompactUsageTotal({
            inputUsage: aggregatedMetrics.inputUsage,
            outputUsage: aggregatedMetrics.outputUsage,
            totalUsage: aggregatedMetrics.totalUsage,
          }) > 0 && (
            <UsageBadge
              inputUsage={aggregatedMetrics.inputUsage}
              outputUsage={aggregatedMetrics.outputUsage}
              totalUsage={aggregatedMetrics.totalUsage}
              usageDetails={aggregatedMetrics.usageDetails}
            />
          )}
        <SessionBadge sessionId={trace.sessionId} projectId={trace.projectId} />
        <UserIdBadge userId={trace.userId} projectId={trace.projectId} />
        {trace.tags.length > 0 && (
          <div className="flex min-w-0 items-center gap-1">
            {/* Session-header pill styling; v4 tags are immutable here, so no
                edit affordance. */}
            {visibleTags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            {hiddenTagCount > 0 && (
              <ModernSessionHeaderPill
                variant="button"
                ariaLabel={`Show ${hiddenTagCount} more tags`}
                onClick={() => setShowAllTags(true)}
              >
                +{hiddenTagCount}
              </ModernSessionHeaderPill>
            )}
            {showAllTags && trace.tags.length > MAX_VISIBLE_TAGS && (
              <ModernSessionHeaderPill
                variant="button"
                ariaLabel="Show fewer tags"
                onClick={() => setShowAllTags(false)}
              >
                show fewer
              </ModernSessionHeaderPill>
            )}
          </div>
        )}
      </CollapsibleBadgeRow>
    </div>
  );
}
