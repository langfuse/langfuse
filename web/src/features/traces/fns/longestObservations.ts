import { type TreeNode } from "@/src/features/traces/types/treeNode";

export type LongestObservation = {
  id: string;
  name: string;
  durationMs: number;
};

/**
 * The longest leaf observations (no children) of a trace by own duration, so
 * wrappers and the root never appear. Ties go to the earliest start. Empty
 * when fewer than two leaves have a duration, or when the trace was capped
 * by the observation limit and the list could be missing rows.
 */
export function findLongestLeafObservations(
  roots: TreeNode[],
  {
    limit = 3,
    truncated = false,
  }: { limit?: number; truncated?: boolean } = {},
): LongestObservation[] {
  if (truncated) return [];

  const leaves: (LongestObservation & { startMs: number })[] = [];
  const stack = [...roots];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.children.length > 0) {
      for (const child of node.children) stack.push(child);
      continue;
    }
    if (node.type === "TRACE" || !node.endTime) continue;
    const startMs = node.startTime.getTime();
    const durationMs = node.endTime.getTime() - startMs;
    if (durationMs <= 0) continue;
    leaves.push({ id: node.id, name: node.name, durationMs, startMs });
  }

  if (leaves.length < 2) return [];

  return leaves
    .sort((a, b) => b.durationMs - a.durationMs || a.startMs - b.startMs)
    .slice(0, limit)
    .map(({ id, name, durationMs }) => ({ id, name, durationMs }));
}
