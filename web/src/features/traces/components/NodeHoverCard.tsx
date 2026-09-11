/**
 * Hover card body shared by the trace visualizations (tree, timeline).
 * Header identifies the node; a short key/value block carries the
 * metrics a row cannot fit. Generations add model and tokens; the trace root
 * shows totals and the observation count. Scores list up to ten names.
 *
 * Renders content only; the caller supplies the surface (Radix HoverCard or a
 * pointer-anchored Layer) so each view can position it its own way.
 */

import { ItemIcon, type LangfuseItemType } from "@/src/components/ItemBadge";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { selectNodeScores } from "@/src/features/traces/fns/nodeScores";
import { type TreeNode } from "@/src/features/traces/types/treeNode";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { numberFormatter, usdFormatter } from "@/src/utils/numbers";
import { ScoreHoverList } from "@/src/components/ScoreBadge/ScoreHoverList";

export const NODE_HOVER_CARD_SURFACE_CLASS =
  "bg-popover text-popover-foreground w-60 rounded-md border p-2.5 text-xs shadow-md";

function typeLabel(type: string): string {
  return (type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()).replace(
    /_/g,
    " ",
  );
}

function durationSeconds(node: TreeNode): number | undefined {
  if (node.endTime && node.startTime) {
    return (node.endTime.getTime() - node.startTime.getTime()) / 1000;
  }
  return node.latency ?? undefined;
}

/** Sum of usage over the node and all descendants (roots have no own usage). */
function subtreeTokens(node: TreeNode): number {
  let total = node.totalUsage ?? 0;
  for (const child of node.children) total += subtreeTokens(child);
  return total;
}

function descendantCount(node: TreeNode): number {
  let count = node.children.length;
  for (const child of node.children) count += descendantCount(child);
  return count;
}

export function NodeHoverCardContent({ node }: { node: TreeNode }) {
  const { mergedScores } = useTraceData();
  const scores = selectNodeScores(mergedScores, node.id);

  const isRoot = node.type === "TRACE";
  const isGeneration = node.type === "GENERATION";
  const duration = durationSeconds(node);
  const tokens = isRoot ? subtreeTokens(node) : (node.totalUsage ?? 0);
  const cost = node.totalCost;

  const rows: Array<{ label: string; value: string }> = [];
  if (isGeneration && node.model)
    rows.push({ label: "Model", value: node.model });
  if (duration != null)
    rows.push({ label: "Duration", value: formatIntervalSeconds(duration) });
  if ((isGeneration || isRoot) && tokens > 0)
    rows.push({
      label: isRoot ? "Total tokens" : "Tokens",
      value: numberFormatter(tokens, 0),
    });
  if (cost && cost.greaterThan(0))
    rows.push({
      label: isRoot ? "Total cost" : "Cost",
      value: usdFormatter(cost.toNumber()),
    });
  if (isRoot)
    rows.push({
      label: "Observations",
      value: numberFormatter(descendantCount(node), 0),
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <ItemIcon
          type={node.type as LangfuseItemType}
          className="size-3.5 shrink-0"
        />
        <span className="min-w-0 truncate font-bold" title={node.name}>
          {node.name || `Unnamed ${node.type.toLowerCase()}`}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0">
          {typeLabel(node.type)}
        </span>
      </div>

      {rows.length > 0 ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          {rows.map((row) => (
            <div
              key={row.label}
              className="col-span-full grid grid-cols-subgrid"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd
                className="truncate text-right tabular-nums"
                title={row.value}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {scores.length > 0 ? (
        <div className="border-border/60 border-t pt-2">
          <ScoreHoverList scores={scores} />
        </div>
      ) : null}
    </div>
  );
}
