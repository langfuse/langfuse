/**
 * SpanListItemView - Renders a tree node row with visual structure.
 *
 * Used by TraceTree (and later SearchResultsList, TimelineView).
 * Renders tree structure (indents, connectors) + content (name, metrics, badges).
 *
 * Consumes contexts:
 * - useTraceData() for scores, comments map
 * - useViewPreferences() for display toggles
 */

import { type TreeNode } from "../lib/types";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { LevelColors } from "@/src/components/level-colors";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { ItemBadge } from "@/src/components/ItemBadge";
import { Button } from "@/src/components/ui/button";
import { ChevronRight } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import { heatMapTextColor } from "@/src/components/trace/lib/helpers";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";
import { useTraceData } from "../contexts/TraceDataContext";
import type Decimal from "decimal.js";

interface SpanListItemViewProps {
  node: TreeNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  commentCount?: number;
}

export function SpanListItemView({
  node,
  depth,
  treeLines,
  isLastSibling,
  isSelected,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  parentTotalCost,
  parentTotalDuration,
  commentCount,
}: SpanListItemViewProps) {
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
    <div
      className={cn(
        "relative flex w-full cursor-pointer rounded-md px-0",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
      )}
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: "0.5rem",
      }}
      onClick={(e) => {
        if (!e.currentTarget?.closest("[data-expand-button]")) {
          onSelect();
        }
      }}
    >
      <div className="flex w-full pl-2">
        {/* 1. Indents: ancestor level indicators */}
        {depth > 0 && (
          <div className="flex flex-shrink-0">
            {Array.from({ length: depth - 1 }, (_, i) => (
              <div key={i} className="relative w-5">
                {treeLines[i] && (
                  <div className="absolute bottom-0 left-3 top-0 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. Current element bars: up/down/horizontal connectors */}
        {depth > 0 && (
          <div className="relative w-5 flex-shrink-0">
            <>
              {/* Vertical bar connecting upwards */}
              <div
                className={cn(
                  "absolute left-3 top-0 w-px bg-border",
                  isLastSibling ? "h-3" : "bottom-3",
                )}
              />
              {/* Vertical bar connecting downwards if not last sibling */}
              {!isLastSibling && (
                <div className="absolute bottom-0 left-3 top-3 w-px bg-border" />
              )}
              {/* Horizontal bar connecting to icon */}
              <div className="absolute left-3 top-3 h-px w-2 bg-border" />
            </>
          </div>
        )}

        {/* 3. Icon + child connector: fixed width container */}
        <div className="relative flex w-6 flex-shrink-0 flex-col py-1.5">
          <div className="relative z-10 flex h-4 items-center justify-center">
            <ItemBadge type={node.type} isSmall className="!size-3" />
          </div>
          {/* Vertical bar downwards if there are expanded children */}
          {node.children.length > 0 && !isCollapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
          {/* Root node downward connector */}
          {depth === 0 && node.children.length > 0 && !isCollapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
        </div>

        {/* 4. Content button: text/metrics/badges */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          title={node.name}
          className={cn(
            "peer relative flex min-w-0 flex-1 items-start rounded-md py-0.5 pl-1 pr-2 text-left",
          )}
        >
          <div className={cn("flex min-w-0 flex-col")}>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <span className="flex-shrink truncate text-xs">
                {node.name || `Unnamed ${node.type.toLowerCase()}`}
              </span>

              <div className="flex items-center gap-x-2">
                {showComments && commentCount !== undefined && (
                  <CommentCountIcon count={commentCount} />
                )}
                {node.type !== "TRACE" &&
                  node.level &&
                  node.level !== "DEFAULT" && (
                    <div className="flex">
                      <span
                        className={cn(
                          "rounded-sm p-0.5 text-xs",
                          LevelColors[node.level as keyof typeof LevelColors]
                            ?.bg,
                          LevelColors[node.level as keyof typeof LevelColors]
                            ?.text,
                        )}
                      >
                        {node.level}
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {shouldRenderAnyMetrics && (
              <div className="flex flex-wrap gap-x-2">
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
                            duration ||
                            (node.latency ? node.latency * 1000 : 0),
                        }),
                    )}
                  >
                    {formatIntervalSeconds(
                      (duration || (node.latency ? node.latency * 1000 : 0)) /
                        1000,
                    )}
                  </span>
                ) : null}
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
                    {node.children.length > 0 || node.type === "TRACE"
                      ? "∑ "
                      : ""}
                    {usdFormatter(totalCost.toNumber())}
                  </span>
                ) : null}
              </div>
            )}

            {showScores && nodeScores.length > 0 && (
              <div className="flex flex-wrap gap-1">
                <GroupedScoreBadges compact scores={nodeScores} />
              </div>
            )}
          </div>
        </button>

        {/* 5. Expand/Collapse button */}
        {node.children.length > 0 && (
          <div className="flex items-center justify-end py-1 pr-1">
            <Button
              data-expand-button
              size="icon"
              variant="ghost"
              onClick={(ev) => {
                ev.stopPropagation();
                onToggleCollapse();
              }}
              className="h-6 w-6 flex-shrink-0 hover:bg-primary/10"
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform transition-transform duration-200 ease-in-out",
                  isCollapsed ? "rotate-0" : "rotate-90",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
