import type { LayoutNode } from "../types";
import { endOf } from "./endOf";
import { startOf } from "./startOf";

export function spanOffsetsOf(
  node: LayoutNode,
  originMs: number,
): { startMs: number; endMs: number } {
  return { startMs: startOf(node) - originMs, endMs: endOf(node) - originMs };
}
