/**
 * TraceSummaryStrip - persistent trace-level summary row.
 *
 * Renders directly under the page header, above the navigation/detail panels,
 * and stays visible regardless of which observation is selected. This is the
 * single home for trace-level attributes (session, user, environment, release,
 * tags) and trace totals (latency, cost) — the detail-panel headers no longer
 * repeat them.
 *
 * Totals are shuffled, not computed: latency comes from the tRPC trace payload
 * (server-derived from observation timestamps) and cost from the same
 * client-side aggregation the detail header already used.
 */

import { useMemo, useState } from "react";

import { CollapsibleBadgeRow } from "@/src/features/traces/components/CollapsibleBadgeRow";
import { TagPill } from "@/src/features/tag/components/TagPill";
import {
  EnvironmentBadge,
  ReleaseBadge,
  SessionBadge,
  UserIdBadge,
} from "@/src/features/traces/components/TraceMetadataBadges";
import { LatencyBadge } from "@/src/features/traces/components/ObservationMetadataBadgesSimple/ObservationMetadataBadgesSimple";
import {
  CostBadge,
  hasRenderableUsage,
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
          hasRenderableUsage({
            inputUsage: aggregatedMetrics.inputUsage,
            outputUsage: aggregatedMetrics.outputUsage,
            totalUsage: aggregatedMetrics.totalUsage,
            usageDetails: aggregatedMetrics.usageDetails,
          }) && (
            <UsageBadge
              compact
              inputUsage={aggregatedMetrics.inputUsage}
              outputUsage={aggregatedMetrics.outputUsage}
              totalUsage={aggregatedMetrics.totalUsage}
              usageDetails={aggregatedMetrics.usageDetails}
            />
          )}
        <SessionBadge sessionId={trace.sessionId} projectId={trace.projectId} />
        <UserIdBadge userId={trace.userId} projectId={trace.projectId} />
        <EnvironmentBadge environment={trace.environment} />
        <ReleaseBadge release={trace.release} />
        {trace.tags.length > 0 && (
          <div className="flex min-w-0 items-center gap-1">
            {/* Quiet chips (dim fill, tight padding): v4 tags are immutable,
                so no edit affordance. */}
            {visibleTags.map((tag) => (
              <TagPill key={tag} tag={tag} />
            ))}
            {hiddenTagCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllTags(true)}
                title={trace.tags.slice(MAX_VISIBLE_TAGS).join(", ")}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                +{hiddenTagCount}
              </button>
            )}
            {showAllTags && trace.tags.length > MAX_VISIBLE_TAGS && (
              <button
                type="button"
                onClick={() => setShowAllTags(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                show fewer
              </button>
            )}
          </div>
        )}
      </CollapsibleBadgeRow>
    </div>
  );
}
