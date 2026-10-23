import { type TreeNode } from "@/src/features/traces/types/treeNode";

/**
 * Self time of a node: its own span minus the union of its children's spans,
 * clipped to the node's interval. A node or child without an end time counts
 * as a zero-length interval.
 */
export function selfTimeMs(node: TreeNode): number {
  if (!node.endTime) return 0;
  const start = node.startTime.getTime();
  const end = node.endTime.getTime();
  if (end <= start) return 0;

  const intervals = node.children
    .map((child) => {
      const childStart = Math.max(child.startTime.getTime(), start);
      const childEnd = Math.min(
        child.endTime ? child.endTime.getTime() : child.startTime.getTime(),
        end,
      );
      return [childStart, childEnd] as const;
    })
    .filter(([childStart, childEnd]) => childEnd > childStart)
    .sort((a, b) => a[0] - b[0]);

  let covered = 0;
  let cursor = -Infinity;
  for (const [childStart, childEnd] of intervals) {
    const from = Math.max(childStart, cursor);
    if (childEnd > from) {
      covered += childEnd - from;
      cursor = childEnd;
    }
  }
  return end - start - covered;
}

/**
 * The one observation with the most self time, from the unfiltered roots.
 * The trace root is excluded: the TRACE wrapper, and a sole top-level
 * observation, whose untracked time is the wrapper's. Ties go to the earliest
 * start. Null when fewer than two observations compete or the winner has no
 * self time.
 */
export function findSlowestObservationId(roots: TreeNode[]): string | null {
  const traceRoot = roots.find((root) => root.type === "TRACE");
  const topLevel = traceRoot ? traceRoot.children : roots;
  const excluded = new Set<string>();
  if (traceRoot) excluded.add(traceRoot.id);
  if (topLevel.length === 1 && topLevel[0]) excluded.add(topLevel[0].id);

  let best: TreeNode | null = null;
  let bestSelfMs = 0;
  let candidates = 0;

  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const child of node.children) stack.push(child);
    if (node.type === "TRACE" || excluded.has(node.id)) continue;
    candidates++;

    const selfMs = selfTimeMs(node);
    if (selfMs <= 0) continue;
    if (
      !best ||
      selfMs > bestSelfMs ||
      (selfMs === bestSelfMs &&
        node.startTime.getTime() < best.startTime.getTime())
    ) {
      best = node;
      bestSelfMs = selfMs;
    }
  }

  if (candidates < 2 || !best) return null;
  return best.id;
}
