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
import { heatMapTextColor } from "@/src/components/trace2/lib/helpers";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";
import { useTraceData } from "../contexts/TraceDataContext";
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
  const { scores } = useTraceData();
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

  const shouldRenderCostTokens =
    showCostTokens &&
    Boolean(
      node.inputUsage || node.outputUsage || node.totalUsage || totalCost,
    );

  const shouldRenderAnyMetrics = shouldRenderDuration || shouldRenderCostTokens;

  // Filter scores for this node
  const nodeScores =
    node.type === "TRACE"
      ? scores.filter((s) => s.observationId === null)
      : scores.filter((s) => s.observationId === node.id);

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
        "peer relative flex min-w-0 flex-1 items-start rounded-md py-0.5 pl-1 pr-2 text-left",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {/* Name and badges row */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="flex-shrink truncate text-xs">
            {node.name || `Unnamed ${node.type.toLowerCase()}`}
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
            {/* Duration */}
            {shouldRenderDuration && (duration || node.latency) ? (
              <span
                title={
                  node.children.length > 0 || node.type === "TRACE"
                    ? "Aggregated duration of all child observations"
                    : undefined
                }
                className={cn(
                  "text-xs text-muted-foreground",
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

            {/* Token counts */}
            {shouldRenderCostTokens &&
            (node.inputUsage || node.outputUsage || node.totalUsage) ? (
              <span className="text-xs text-muted-foreground">
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
                  "text-xs text-muted-foreground",
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

        {/* Scores row */}
        {showScores && nodeScores.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <GroupedScoreBadges compact scores={nodeScores} />
          </div>
        )}
      </div>
    </button>
  );
}
