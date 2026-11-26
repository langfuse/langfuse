import type { LayoutNode } from "../types";

export function startOf(node: LayoutNode): number {
  return node.startTime.getTime();
}
