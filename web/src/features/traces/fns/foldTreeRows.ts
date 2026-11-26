import type { FlatNode } from "./flattenTree";

type TreeFold = {
  targetId: string;
  /** Fade step of each row kept beside the target; 0 fades least. */
  fadeSteps: Map<string, number>;
};

/**
 * Folds flattened rows around one node: its ancestors, the node itself, then
 * `trailing` rows that fade out. Null when the node has no row.
 */
export function foldTreeRows<T extends { id: string }>(
  rows: FlatNode<T>[],
  isTarget: (node: T) => boolean,
  trailing: number,
): TreeFold | null {
  const targetIndex = rows.findIndex((row) => isTarget(row.node));
  const target = rows[targetIndex];
  if (!target) return null;

  const fadeSteps = new Map<string, number>();
  let depth = target.depth;
  for (let index = targetIndex - 1; index >= 0 && depth > 0; index--) {
    const row = rows[index]!;
    if (row.depth >= depth) continue;
    fadeSteps.set(row.node.id, 0);
    depth = row.depth;
  }
  rows
    .slice(targetIndex + 1, targetIndex + 1 + trailing)
    .forEach((row, step) => fadeSteps.set(row.node.id, step));

  return { targetId: target.node.id, fadeSteps };
}
