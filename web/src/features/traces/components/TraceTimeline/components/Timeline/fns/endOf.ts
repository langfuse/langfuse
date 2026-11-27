import type { LayoutNode } from "../types";
import { startOf } from "./startOf";

export function endOf(node: LayoutNode): number {
  if (node.endTime) return node.endTime.getTime();
  if (node.latency != null && Number.isFinite(node.latency)) {
    return startOf(node) + node.latency * 1000;
  }
  return startOf(node);
}
