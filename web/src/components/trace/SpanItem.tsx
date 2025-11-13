import { type TreeNode } from "./lib/types";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { LevelColors } from "@/src/components/level-colors";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import {
  calculateDisplayTotalCost,
  heatMapTextColor,
  unnestObservation,
} from "@/src/components/trace/lib/helpers";
import { type ScoreDomain } from "@langfuse/shared";
import type Decimal from "decimal.js";
import React from "react";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export interface SpanItemProps {
  node: TreeNode;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  comments?: Map<string, number>;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  showComments?: boolean;
  className?: string;
}

export const SpanItem: React.FC<SpanItemProps> = ({
  node,
  scores,
  comments,
  showDuration,
  showCostTokens,
  showScores,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  showComments = true,
  className,
}) => {
  const convertTreeNodeToObservation = (treeNode: TreeNode): any => ({
    ...treeNode,
    children: treeNode.children.map(convertTreeNodeToObservation),
  });

  const totalCost = calculateDisplayTotalCost({
    allObservations:
      node.children.length > 0
        ? node.children.flatMap((child) =>
            unnestObservation(convertTreeNodeToObservation(child)),
          )
        : [convertTreeNodeToObservation(node)],
  });

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

  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        <span className="flex-shrink truncate text-xs">{node.name}</span>

        <div className="flex items-center gap-x-2">
          {comments && showComments ? (
            <CommentCountIcon count={comments.get(node.id)} />
          ) : null}
          {node.type !== "TRACE" && node.level && node.level !== "DEFAULT" ? (
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
          ) : null}
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
                    value: duration || (node.latency ? node.latency * 1000 : 0),
                  }),
              )}
            >
              {formatIntervalSeconds(
                (duration || (node.latency ? node.latency * 1000 : 0)) / 1000,
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
              {node.children.length > 0 || node.type === "TRACE" ? "∑ " : ""}
              {usdFormatter(totalCost.toNumber())}
            </span>
          ) : null}
        </div>
      )}

      {showScores &&
        ((node.type === "TRACE" &&
          scores.find((s) => s.observationId === null)) ||
          scores.find((s) => s.observationId === node.id)) && (
          <div className="flex flex-wrap gap-1">
            <GroupedScoreBadges
              compact
              scores={
                node.type === "TRACE"
                  ? scores.filter((s) => s.observationId === null)
                  : scores.filter((s) => s.observationId === node.id)
              }
            />
          </div>
        )}
    </div>
  );
};
