import { type TreeNode } from "@/src/features/traces/types/treeNode";

export type LongestLeafObservation = {
  id: string;
  durationMs: number;
  /** Fraction of the trace duration, undefined when the trace has none. */
  shareOfTrace: number | undefined;
};

/**
 * The single longest leaf observation of a trace. Wrappers are skipped: their
 * duration is their children's. Ties go to the earliest start. Null when the
 * trace has fewer than two leaves or was capped, since a hidden leaf could be
 * the longest.
 */
export function pickLongestLeafObservation(
  roots: TreeNode[],
  options: {
    traceTotalDurationMs?: number;
    truncatedAtObservations?: number;
  } = {},
): LongestLeafObservation | null {
  if (options.truncatedAtObservations != null) return null;

  let leafCount = 0;
  let longest: TreeNode | undefined;
  let longestMs = -Infinity;

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.children.length > 0) {
      stack.push(...node.children);
      continue;
    }
    if (node.type === "TRACE") continue;
    leafCount++;
    if (!node.endTime) continue;
    const durationMs = node.endTime.getTime() - node.startTime.getTime();
    if (
      durationMs > longestMs ||
      (durationMs === longestMs &&
        longest &&
        node.startTime.getTime() < longest.startTime.getTime())
    ) {
      longest = node;
      longestMs = durationMs;
    }
  }

  if (leafCount < 2 || !longest || longestMs <= 0) return null;

  const total = options.traceTotalDurationMs;
  return {
    id: longest.id,
    durationMs: longestMs,
    shareOfTrace: total && total > 0 ? longestMs / total : undefined,
  };
}
