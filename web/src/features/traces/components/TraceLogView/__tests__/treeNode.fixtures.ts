import { type TreeNode } from "@/src/features/traces/fns/types";

/** Creates a minimal TreeNode for testing. */
export function createNode(
  overrides: Partial<TreeNode> & { id: string; type: TreeNode["type"] },
): TreeNode {
  return {
    name: overrides.name ?? overrides.id,
    startTime: overrides.startTime ?? new Date("2024-01-01T00:00:00Z"),
    endTime: overrides.endTime ?? null,
    children: overrides.children ?? [],
    startTimeSinceTrace: overrides.startTimeSinceTrace ?? 0,
    startTimeSinceParentStart: overrides.startTimeSinceParentStart ?? null,
    depth: overrides.depth ?? 0,
    childrenDepth: overrides.childrenDepth ?? 0,
    ...overrides,
  };
}

/** Creates a TRACE root node wrapping the given observations. */
export function createTraceRoot(children: TreeNode[]): TreeNode {
  return createNode({
    id: "trace-root",
    type: "TRACE",
    name: "Test Trace",
    startTime: new Date("2024-01-01T00:00:00Z"),
    children,

    depth: -1,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
  });
}
