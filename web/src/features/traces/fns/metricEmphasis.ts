import Decimal from "decimal.js";
import { type TreeNode } from "@/src/features/traces/types/treeNode";

/** A row at or above this share of the trace total is emphasised. */
const METRIC_EMPHASIS_THRESHOLD = 0.5;

export type MetricEmphasisContext = {
  traceTotalCost?: Decimal;
  traceTotalDurationMs?: number;
};

function nodeDurationMs(node: TreeNode): number | undefined {
  if (node.latency != null) return node.latency * 1000;
  if (node.endTime) return node.endTime.getTime() - node.startTime.getTime();
  return undefined;
}

/**
 * Undefined for the trace root and for a lone top-level observation: both
 * are the whole trace, so their share is always 100%.
 */
export function resolveMetricEmphasisContext(
  node: TreeNode,
  roots: TreeNode[],
): MetricEmphasisContext | undefined {
  if (node.type === "TRACE") return undefined;
  const traceRoot = roots.find((root) => root.type === "TRACE");
  const topLevel = traceRoot ? traceRoot.children : roots;
  if (topLevel.length === 1 && topLevel[0]?.id === node.id) return undefined;

  const base = traceRoot ? [traceRoot] : roots;
  const durations = base
    .map(nodeDurationMs)
    .filter((d): d is number => d != null);
  return {
    traceTotalCost: base.reduce<Decimal | undefined>((acc, r) => {
      if (!r.totalCost) return acc;
      return acc ? acc.plus(r.totalCost) : r.totalCost;
    }, undefined),
    traceTotalDurationMs:
      durations.length > 0 ? Math.max(...durations) : undefined,
  };
}

export function isEmphasizedShare(
  value: number | Decimal | undefined,
  total: number | Decimal | undefined,
): boolean {
  if (value == null || total == null) return false;
  const totalDecimal = new Decimal(total);
  if (totalDecimal.lte(0)) return false;
  return new Decimal(value).div(totalDecimal).gte(METRIC_EMPHASIS_THRESHOLD);
}
