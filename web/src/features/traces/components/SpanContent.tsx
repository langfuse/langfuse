/* eslint-disable @repo/no-style-props */
/**
 * SpanContent - Pure span/observation content renderer.
 *
 * Responsibilities:
 * - Render span-specific data (name, metrics, badges, scores)
 * - Apply view preferences (show/hide features)
 * - Format and display metrics with color coding
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
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter, numberFormatter } from "@/src/utils/numbers";
import { heatMapTextColor } from "@/src/features/traces/fns/heatMapTextColor";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { selectNodeScores } from "@/src/features/traces/fns/nodeScores";
import type Decimal from "decimal.js";

interface SpanContentProps {
  node: TreeNode;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  commentCount?: number;
  onSelect?: () => void;
  onHover?: () => void;
  className?: string;
}

export function SpanContent({
  node,
  parentTotalCost,
  parentTotalDuration,
  commentCount,
  onSelect,
  onHover,
  className,
}: SpanContentProps) {
  const { mergedScores } = useTraceData();
  const {
    showDuration,
    showCostTokens,
    showScores,
    colorCodeMetrics,
    showComments,
  } = useViewPreferences();

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

  const shouldRenderDuration =
    showDuration && Boolean(duration || node.latency);

  // Tokens stand in for cost only when there is no cost to show.
  const tokenTotal = ownCost ? 0 : (node.totalUsage ?? 0);
  const shouldRenderCostTokens =
    showCostTokens && Boolean(ownCost || tokenTotal);

  const shouldRenderAnyMetrics = shouldRenderDuration || shouldRenderCostTokens;

  const nodeScores = selectNodeScores(mergedScores, node.id);

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
      className={cn(
        "peer relative flex min-w-0 flex-1 items-center rounded-md py-0.5 pr-2 pl-1 text-left",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {/* Name and badges row */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="shrink truncate text-xs" title={nodeDisplayName}>
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
                <ObservationLevelBadge level={node.level} size="sm" />
              )}
          </div>
        </div>

        {/* Metrics row */}
        {shouldRenderAnyMetrics && (
          <div className="flex flex-wrap gap-x-2">
            {/* Duration (own span) */}
            {shouldRenderDuration && (duration || node.latency) ? (
              <span
                title={
                  node.type === "TRACE"
                    ? "Total trace duration"
                    : "Own span duration"
                }
                className={cn(
                  "text-foreground-tertiary text-xs",
                  parentTotalDuration &&
                    colorCodeMetrics &&
                    heatMapTextColor({
                      max: parentTotalDuration,
                      value:
                        duration || (node.latency ? node.latency * 1000 : 0),
                    }),
                )}
              >
                {formatIntervalSeconds(
                  (duration || (node.latency ? node.latency * 1000 : 0)) / 1000,
                )}
              </span>
            ) : null}

            {/* Tokens, only without a cost */}
            {shouldRenderCostTokens && tokenTotal ? (
              <span
                title="Total tokens"
                className="text-foreground-tertiary text-xs"
              >
                {numberFormatter(tokenTotal, 0)} tokens
              </span>
            ) : null}

            {/* Cost */}
            {shouldRenderCostTokens && ownCost ? (
              <span
                className={cn(
                  "text-foreground-tertiary text-xs",
                  parentTotalCost &&
                    colorCodeMetrics &&
                    heatMapTextColor({
                      max: parentTotalCost,
                      value: ownCost,
                    }),
                )}
              >
                {usdFormatter(ownCost)}
              </span>
            ) : null}
          </div>
        )}

        {/* Scores row. Inline badges are capped; the rest roll into a "+N"
            pill that opens a table of all scores. */}
        {showScores && nodeScores.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <GroupedScoreBadges compact scores={nodeScores} />
          </div>
        )}
      </div>
    </button>
  );
}
