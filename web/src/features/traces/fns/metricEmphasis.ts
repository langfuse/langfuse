import Decimal from "decimal.js";
import { type TreeNode } from "@/src/features/traces/types/treeNode";

/** A row at or above this share of the trace total is emphasised. */
const METRIC_EMPHASIS_THRESHOLD = 0.5;

export type MetricEmphasisContext = {
  traceTotalCost?: Decimal;
  traceTotalDurationMs?: number;
};

export type TraceMetricEmphasis = {
  totals: MetricEmphasisContext;
  /** Rows that are the whole trace, so their share is always 100%. */
  wholeTraceNodeIds: Set<string>;
};

function nodeDurationMs(node: TreeNode): number | undefined {
  if (node.latency != null) return node.latency * 1000;
  if (node.endTime) return node.endTime.getTime() - node.startTime.getTime();
  return undefined;
}

/**
 * Trace-wide totals, derived once per trace from the unfiltered roots so every
 * view emphasises the same rows regardless of level filtering.
 */
export function computeTraceMetricEmphasis(
  roots: TreeNode[],
): TraceMetricEmphasis {
  const traceRoot = roots.find((root) => root.type === "TRACE");
  const topLevel = traceRoot ? traceRoot.children : roots;
  const base = traceRoot ? [traceRoot] : roots;

  const wholeTraceNodeIds = new Set<string>();
  if (traceRoot) wholeTraceNodeIds.add(traceRoot.id);
  if (topLevel.length === 1 && topLevel[0])
    wholeTraceNodeIds.add(topLevel[0].id);

  let traceTotalCost: Decimal | undefined;
  let traceTotalDurationMs: number | undefined;
  for (const root of base) {
    if (root.totalCost) {
      traceTotalCost = traceTotalCost
        ? traceTotalCost.plus(root.totalCost)
        : root.totalCost;
    }
    const duration = nodeDurationMs(root);
    if (duration != null && (traceTotalDurationMs ?? -Infinity) < duration) {
      traceTotalDurationMs = duration;
    }
  }

  return {
    totals: { traceTotalCost, traceTotalDurationMs },
    wholeTraceNodeIds,
  };
}

/** Undefined when the row is the whole trace: its share is always 100%. */
export function metricEmphasisFor(
  node: TreeNode,
  trace: TraceMetricEmphasis | undefined,
): MetricEmphasisContext | undefined {
  if (!trace) return undefined;
  if (node.type === "TRACE") return undefined;
  if (trace.wholeTraceNodeIds.has(node.id)) return undefined;
  return trace.totals;
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
