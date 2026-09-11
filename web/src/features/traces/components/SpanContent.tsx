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
import { useState } from "react";
import { Layer } from "@/src/components/ui/layer";
import {
  tooltipPlacement,
  tooltipStyle,
} from "@/src/features/traces/fns/timeline/tooltipPlacement";
import {
  NODE_HOVER_CARD_SURFACE_CLASS,
  NodeHoverCardContent,
} from "@/src/features/traces/components/NodeHoverCard";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { ObservationLevelBadge } from "@/src/features/traces/components/ObservationLevelBadge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { getSubtreeDurationOverflowMs } from "@/src/features/traces/fns/getSubtreeDurationOverflowMs";
import { heatMapTextColor } from "@/src/features/traces/fns/heatMapTextColor";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { selectNodeScores } from "@/src/features/traces/fns/nodeScores";
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
  const { mergedScores, traceLevelScoreOwnerIds, nodeMap } = useTraceData();
  // The heat map compares a row against the trace total. It says nothing on
  // the trace wrapper, on root observations, or on an only child (a lone
  // wrapper span is ~100% of its parent by construction), so those rows are
  // never tinted.
  const parentNode = node.parentObservationId
    ? nodeMap.get(node.parentObservationId)
    : undefined;
  const isRootRow =
    node.type === "TRACE" ||
    !parentNode ||
    parentNode.type === "TRACE" ||
    parentNode.children.length === 1;
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

  // Rows carry only duration and cost; token counts live in the detail panel.
  const shouldRenderCost = showCostTokens && Boolean(totalCost);

  // Generations carry their model inline: it is the one attribute that varies
  // per LLM call, so the row is where a mixed-model trace becomes visible.
  const shouldRenderModel = node.type === "GENERATION" && Boolean(node.model);

  const shouldRenderAnyMetrics =
    shouldRenderDuration || shouldRenderCost || shouldRenderModel;

  const nodeScores = selectNodeScores(
    mergedScores,
    node.id,
    traceLevelScoreOwnerIds,
  );

  const nodeDisplayName = node.name || `Unnamed ${node.type.toLowerCase()}`;

  const [hovered, setHovered] = useState<{
    clientX: number;
    clientY: number;
  } | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
        onMouseEnter={onHover}
        // Hover card follows the pointer, like the timeline's: it appears
        // where you are looking, not at a fixed edge of a variable-width row.
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          setHovered({ clientX: event.clientX, clientY: event.clientY });
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerDown={() => setHovered(null)}
        // No row-level title: it would pop a native tooltip from ANYWHERE in the
        // row — stacking on the score chips' own titles and the ScoreTag level
        // tooltip. The truncating name span below carries its own title.
        className={cn(
          "peer relative flex min-w-0 flex-1 items-center rounded-md py-[3px] pr-2 pl-1 text-left",
          className,
        )}
      >
        <div className="flex min-w-0 flex-col">
          {/* Name and badges row */}
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <span
              // Medium weight approved for the tree name: bold read too heavy
              // at 12px, regular gave no hierarchy over the metrics line.
              // No native title: the full name lives in the row hover card.
              // eslint-disable-next-line @repo/no-raw-font-weight
              className="shrink overflow-hidden text-xs font-medium text-ellipsis whitespace-nowrap"
            >
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
                  className={cn(
                    "text-foreground-tertiary text-xs",
                    parentTotalDuration &&
                      colorCodeMetrics &&
                      !isRootRow &&
                      heatMapTextColor({
                        max: parentTotalDuration,
                        value:
                          duration || (node.latency ? node.latency * 1000 : 0),
                      }),
                  )}
                >
                  {formatIntervalSeconds(
                    (duration || (node.latency ? node.latency * 1000 : 0)) /
                      1000,
                  )}
                </span>
              ) : null}

              {/* Subtree wall-clock duration — async descendants outlive the parent span */}
              {shouldRenderSubtreeDuration ? (
                <span className="text-foreground-tertiary text-xs">
                  {"∑ "}
                  {formatIntervalSeconds(subtreeWallClockOverflowMs / 1000)}
                </span>
              ) : null}

              {/* Cost */}
              {shouldRenderCost && totalCost ? (
                <span
                  className={cn(
                    "text-foreground-tertiary text-xs",
                    parentTotalCost &&
                      colorCodeMetrics &&
                      !isRootRow &&
                      heatMapTextColor({
                        max: parentTotalCost,
                        value: totalCost,
                      }),
                  )}
                >
                  {usdFormatter(totalCost.toNumber())}
                </span>
              ) : null}

              {/* Model (generations only) */}
              {shouldRenderModel ? (
                <span
                  // No native title: the model is in the row hover card.
                  className="text-foreground-tertiary max-w-40 overflow-hidden text-xs text-ellipsis whitespace-nowrap"
                >
                  {node.model}
                </span>
              ) : null}
            </div>
          )}

          {/* Scores row. Cap the inline badges and roll the rest into a "+N"
            pill (hover to see them) so a node with many scores stays a compact
            one/two-line row instead of a tall wrapping grid. */}
          {showScores && nodeScores.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              <GroupedScoreBadges
                compact
                hideLevels
                scores={nodeScores}
                maxVisible={MAX_INLINE_SCORE_GROUPS}
              />
            </div>
          )}
        </div>
      </button>
      {hovered ? (
        <Layer name="tooltip">
          <div
            className={cn(
              NODE_HOVER_CARD_SURFACE_CLASS,
              "pointer-events-none fixed",
            )}
            style={{
              ...tooltipStyle(
                tooltipPlacement({
                  clientX: hovered.clientX,
                  clientY: hovered.clientY,
                  viewportWidth: window.innerWidth,
                  viewportHeight: window.innerHeight,
                }),
              ),
              // The helper's 10px suits the dense timeline readout; the card
              // reads at the tree's own text-xs.
              fontSize: undefined,
            }}
          >
            <NodeHoverCardContent node={node} />
          </div>
        </Layer>
      ) : null}
    </>
  );
}
