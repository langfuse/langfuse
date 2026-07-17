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

import { type TreeNode } from "../lib/types";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { LevelColors } from "@/src/components/level-colors";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import {
  heatMapTextColor,
  getSubtreeDurationOverflowMs,
} from "@/src/components/trace/lib/helpers";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";
import { useTraceData } from "../contexts/TraceDataContext";
import type Decimal from "decimal.js";

// How many distinct score groups to show inline on a tree/search row before
// collapsing the rest into a "+N" pill. Keeps dense-score rows compact; the
// full set is always on the node's Scores tab. (The timeline caps at 3.)
const MAX_INLINE_SCORE_GROUPS = 3;

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
  const { mergedScores, roots } = useTraceData();
  const {
    showDuration,
    showCostTokens,
    showScores,
    colorCodeMetrics,
    showComments,
  } = useViewPreferences();

  // Use pre-computed cost from the TreeNode
  const totalCost = node.totalCost;

  const duration =
    node.endTime && node.startTime
      ? node.endTime.getTime() - node.startTime.getTime()
      : node.latency
        ? node.latency * 1000
        : undefined;

  const shouldRenderDuration =
    showDuration && Boolean(duration || node.latency);

  // Wall-clock duration of the whole subtree, surfaced as a second badge beside
  // the own-span badge when async descendants outlive the parent span (so the
  // own-span duration above understates the real elapsed time). See LFE-10475.
  // It only complements the own-span badge — never renders alone — so a node
  // with no own-span duration (e.g. an in-flight/crashed observation with no
  // endTime) shows nothing rather than an orphaned "∑" with no anchor.
  const subtreeWallClockOverflowMs = showDuration
    ? getSubtreeDurationOverflowMs(duration, node.subtreeWallClockDurationMs)
    : null;
  const shouldRenderSubtreeDuration =
    shouldRenderDuration && subtreeWallClockOverflowMs != null;

  const shouldRenderCostTokens =
    showCostTokens &&
    Boolean(
      node.inputUsage || node.outputUsage || node.totalUsage || totalCost,
    );

  const shouldRenderAnyMetrics = shouldRenderDuration || shouldRenderCostTokens;

  const hasTraceNode = roots.some((r) => r.type === "TRACE");

  // Filter scores for this node
  // - TRACE nodes: show trace-level scores (observationId === null)
  // - Top-level observations in rendered v4 tree (no TRACE node): show trace-level + observation-level scores
  // - All other observations: show only observation-level scores
  const isTopLevelTreeNode = roots.some((root) => root.id === node.id);
  const nodeScores =
    node.type === "TRACE"
      ? mergedScores.filter((s) => s.observationId === null)
      : isTopLevelTreeNode && !hasTraceNode
        ? mergedScores.filter(
            (s) => s.observationId === node.id || s.observationId === null,
          )
        : mergedScores.filter((s) => s.observationId === node.id);

  const nodeDisplayName = node.name || `Unnamed ${node.type.toLowerCase()}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      onMouseEnter={onHover}
      title={node.name}
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
            {showComments && commentCount !== undefined && (
              <CommentCountIcon count={commentCount} />
            )}

            {/* Level badge */}
            {node.type !== "TRACE" &&
              node.level &&
              node.level !== "DEFAULT" && (
                <div className="flex">
                  <span
                    className={cn(
                      "rounded-sm p-0.5 text-xs",
                      LevelColors[node.level as keyof typeof LevelColors]?.bg,
                      LevelColors[node.level as keyof typeof LevelColors]?.text,
                    )}
                  >
                    {node.level}
                  </span>
                </div>
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

            {/* Subtree wall-clock duration — async descendants outlive the parent span */}
            {shouldRenderSubtreeDuration ? (
              <span
                title="Subtree wall-clock duration (first start → last end)"
                className="text-foreground-tertiary text-xs"
              >
                {"∑ "}
                {formatIntervalSeconds(subtreeWallClockOverflowMs / 1000)}
              </span>
            ) : null}

            {/* Token counts */}
            {shouldRenderCostTokens &&
            (node.inputUsage || node.outputUsage || node.totalUsage) ? (
              <span className="text-foreground-tertiary text-xs">
                {formatTokenCounts(
                  node.inputUsage,
                  node.outputUsage,
                  node.totalUsage,
                )}
              </span>
            ) : null}

            {/* Cost */}
            {shouldRenderCostTokens && totalCost ? (
              <span
                title={
                  node.children.length > 0 || node.type === "TRACE"
                    ? "Aggregated cost of all child observations"
                    : undefined
                }
                className={cn(
                  "text-foreground-tertiary text-xs",
                  parentTotalCost &&
                    colorCodeMetrics &&
                    heatMapTextColor({
                      max: parentTotalCost,
                      value: totalCost,
                    }),
                )}
              >
                {node.children.length > 0 || node.type === "TRACE" ? "∑ " : ""}
                {usdFormatter(totalCost.toNumber())}
              </span>
            ) : null}
          </div>
        )}

        {/* Scores row. Cap the inline badges and roll the rest into a "+N"
            pill (hover to see them) so a node with many scores stays a compact
            one/two-line row instead of a tall wrapping grid. */}
        {showScores && nodeScores.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <GroupedScoreBadges
              compact
              scores={nodeScores}
              maxVisible={MAX_INLINE_SCORE_GROUPS}
            />
          </div>
        )}
      </div>
    </button>
  );
}
