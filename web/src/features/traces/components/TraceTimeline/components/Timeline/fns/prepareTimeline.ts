import type { LayoutNode, PreparedTimeline, TimelineRow } from "../types";
import { endOf } from "./endOf";
import { startOf } from "./startOf";

export function prepareTimeline<TNode extends LayoutNode>(
  roots: readonly TNode[],
  collapsed: ReadonlySet<string> = new Set(),
): PreparedTimeline<TNode> {
  if (roots.length === 0) {
    return { rows: [], originMs: 0, durationMs: 0, spans: [] };
  }

  let originMs = Infinity;
  let latestEndMs = -Infinity;
  const all: TNode[] = [];
  const boundsStack: TNode[] = [...roots];
  while (boundsStack.length > 0) {
    const node = boundsStack.pop()!;
    all.push(node);
    originMs = Math.min(originMs, startOf(node));
    latestEndMs = Math.max(latestEndMs, endOf(node));
    for (const child of node.children) boundsStack.push(child as TNode);
  }

  if (!Number.isFinite(originMs) || !Number.isFinite(latestEndMs)) {
    return { rows: [], originMs: 0, durationMs: 0, spans: [] };
  }
  const durationMs = Math.max(latestEndMs - originMs, 0);

  // Roots are excluded: a root covers the whole trace by definition, so keeping
  // it would mean no stretch of the trace is ever idle.
  const rootIds = new Set(roots.map((root) => root.id));
  const spans: Array<[number, number]> = [];
  for (const node of all) {
    if (rootIds.has(node.id)) continue;
    spans.push([startOf(node) - originMs, endOf(node) - originMs]);
  }

  const byStart = (a: TNode, b: TNode) => startOf(a) - startOf(b);
  const rows: Array<TimelineRow<TNode>> = [];
  const stack: Array<Omit<TimelineRow<TNode>, "hasChildren" | "isCollapsed">> =
    [];
  const sortedRoots = [...roots].sort(byStart);
  for (let i = sortedRoots.length - 1; i >= 0; i--) {
    stack.push({
      node: sortedRoots[i]!,
      depth: 0,
      treeLines: [],
      isLastSibling: i === sortedRoots.length - 1,
    });
  }

  while (stack.length > 0) {
    const current = stack.pop()!;
    const hasChildren = current.node.children.length > 0;
    const isCollapsed = collapsed.has(current.node.id);
    rows.push({ ...current, hasChildren, isCollapsed });

    if (!hasChildren || isCollapsed) continue;
    const children = [...(current.node.children as TNode[])].sort(byStart);
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i]!,
        depth: current.depth + 1,
        treeLines: [...current.treeLines, i !== children.length - 1],
        isLastSibling: i === children.length - 1,
      });
    }
  }

  return { rows, originMs, durationMs, spans };
}
