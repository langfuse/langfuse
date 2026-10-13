/* eslint-disable @repo/no-style-props */
/**
 * SpanContent - Pure span/observation content renderer.
 *
 * Responsibilities:
 * - Render span-specific data (name, metrics, badges, scores)
 * - Apply view preferences (show/hide features)
 * - Format metrics; a row that is most of the trace reads in foreground
 *
 * Does NOT know about:
 * - Tree structure (indents, lines, collapse buttons)
 * - How it's being displayed (tree, list, timeline, etc.)
 *
 * This component can be reused in ANY context that needs to display span content:
 * - Tree view (wrapped in TreeNodeWrapper)
 * - Search results (standalone)
 * - Timeline view (custom layout)
 * - Preview cards (modal/panel)
 */

import { type TreeNode } from "../types/treeNode";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ObservationLevelBadge } from "@/src/features/traces/components/ObservationLevelBadge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";
import {
  isEmphasizedShare,
  type MetricEmphasisContext,
} from "@/src/features/traces/fns/metricEmphasis";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { selectNodeScores } from "@/src/features/traces/fns/nodeScores";

interface SpanContentProps {
  node: TreeNode;
  emphasis?: MetricEmphasisContext;
  commentCount?: number;
  onSelect?: () => void;
  onHover?: () => void;
  className?: string;
}

const rootClassName =
  "peer relative flex min-w-0 flex-1 items-start gap-2 rounded-md py-1 pr-2 pl-1 text-left";

export function SpanContent(props: SpanContentProps | { isLoading: true }) {
  if ("isLoading" in props) return <SpanContentLoading />;
  return <LoadedSpanContent {...props} />;
}

/** Name and metrics lines at their text heights, so rows keep their height. */
function SpanContentLoading() {
  return (
    <div className={rootClassName}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-32" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

function LoadedSpanContent({
  node,
  emphasis,
  commentCount,
  onSelect,
  onHover,
  className,
}: SpanContentProps) {
  const { mergedScores } = useTraceData();
  const { showDuration, showCostTokens, showScores, showComments } =
    useViewPreferences();

  // Own cost only; sums over children belong to the detail panel, not the row.
  const ownCost =
    node.calculatedTotalCost ??
    (node.calculatedInputCost ?? 0) + (node.calculatedOutputCost ?? 0);

  const duration = (() => {
    if (node.endTime && node.startTime) {
      return node.endTime.getTime() - node.startTime.getTime();
    }
    if (node.latency) {
      return node.latency * 1000;
    }
    return undefined;
  })();

  const durationMs = duration || (node.latency ? node.latency * 1000 : 0);

  const shouldRenderDuration = showDuration && Boolean(durationMs);
  const emphasizeDuration = isEmphasizedShare(
    durationMs,
    emphasis?.traceTotalDurationMs,
  );
  const emphasizeCost = isEmphasizedShare(ownCost, emphasis?.traceTotalCost);

  // Tokens stand in for cost only when there is no cost to show.
  const tokenTotal = ownCost ? 0 : (node.totalUsage ?? 0);
  const shouldRenderCostTokens =
    showCostTokens && Boolean(ownCost || tokenTotal);

  const shouldRenderAnyMetrics = shouldRenderDuration || shouldRenderCostTokens;

  const nodeScores = selectNodeScores(mergedScores, node.id);
  const shouldRenderScores = showScores && nodeScores.length > 0;

  const nodeDisplayName = node.name || `Unnamed ${node.type.toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onMouseEnter={onHover}
      // No row-level title: it would pop a native tooltip from ANYWHERE in the
      // row — stacking on the score chips' own titles and the ScoreTag level
      // tooltip. The truncating name span below carries its own title.
      className={cn(rootClassName, className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Name and badges row */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="shrink truncate text-sm" title={nodeDisplayName}>
            {nodeDisplayName}
          </span>

          <div className="flex items-center gap-x-2">
            {/* Comment count */}
            {showComments &&
              commentCount !== undefined &&
              commentCount !== 0 && <CommentCountIcon count={commentCount} />}

            {/* Level badge */}
            {node.type !== "TRACE" &&
              node.level &&
              node.level !== "DEFAULT" && (
                <ObservationLevelBadge level={node.level} />
              )}
          </div>
        </div>

        {/* Metrics and scores row */}
        {(shouldRenderAnyMetrics || shouldRenderScores) && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 font-mono">
            {/* Duration (own span) */}
            {shouldRenderDuration ? (
              <span
                title={
                  node.type === "TRACE"
                    ? "Total trace duration"
                    : "Own span duration"
                }
                className={cn(
                  "text-xs",
                  emphasizeDuration
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {formatIntervalSeconds(durationMs / 1000)}
              </span>
            ) : null}

            {/* Tokens, only without a cost */}
            {shouldRenderCostTokens && tokenTotal ? (
              <span
                title="Total tokens"
                className="text-muted-foreground text-xs"
              >
                {numberFormatter(tokenTotal, 0)} tokens
              </span>
            ) : null}

            {/* Cost */}
            {shouldRenderCostTokens && ownCost ? (
              <span
                className={cn(
                  "text-xs",
                  emphasizeCost ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {usdFormatter(ownCost)}
              </span>
            ) : null}

            {/* Scores: one badge inline; the rest roll into a "+N" pill that
                opens a table of all scores. */}
            {shouldRenderScores && (
              <span className="flex min-w-0 items-center gap-1">
                <GroupedScoreBadges maxVisible={1} scores={nodeScores} />
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
