/**
 * Tree building utilities for trace component.
 *
 * IMPLEMENTATION APPROACH:
 * Uses fully iterative algorithms (no recursion) to avoid stack overflow on deep trees (10k+ depth).
 *
 * Algorithm Overview:
 * 1. Sort observations by startTime
 * 2. Build dependency graph: Map-based parent-child relationships (O(N))
 * 3. Topological sort: Process nodes bottom-up (leaves first) using queue with index-based traversal
 * 4. Cost aggregation: Compute bottom-up during tree construction (children before parents)
 * 5. Flatten to searchItems: Iterative pre-order traversal using explicit stack
 *
 * Level filtering (hiding DEBUG observations etc.) is NOT done here — it's applied
 * as a post-processing step via removeHiddenNodes() in the display layer (TraceDataContext).
 *
 * Complexity: O(N) time, O(N) space - handles unlimited depth without stack overflow.
 *
 * Main export: buildTraceUiData() - builds tree, nodeMap, and searchItems from trace + observations.
 */

import { type TreeNode, type TraceSearchListItem } from "./types";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import Decimal from "decimal.js";
import {
  type ObservationLevelType,
  ObservationLevel,
  type TraceDomain,
} from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

type TraceType = Omit<
  WithStringifiedMetadata<TraceDomain>,
  "input" | "output"
> & {
  input: string | null;
  output: string | null;
  latency?: number;
  // For events-based traces: when set, root observation becomes tree root
  rootObservationType?: string;
  rootObservationId?: string;
};

/**
 * Processing node for iterative tree building.
 * Tracks parent-child relationships and processing state for bottom-up traversal.
 */
interface ProcessingNode {
  observation: ObservationReturnType;
  childrenIds: string[];
  inDegree: number; // Number of unprocessed children (for topological sort)
  depth: number; // Tree depth (calculated during graph building)
  treeNode?: TreeNode; // Set when node is processed
}

/**
 * Returns observation levels at or above the minimum level.
 */
export function getObservationLevels(
  minLevel: ObservationLevelType | undefined,
) {
  const ascendingLevels = [
    ObservationLevel.DEBUG,
    ObservationLevel.DEFAULT,
    ObservationLevel.WARNING,
    ObservationLevel.ERROR,
  ];

  if (!minLevel) return ascendingLevels;

  const minLevelIndex = ascendingLevels.indexOf(minLevel);
  return ascendingLevels.slice(minLevelIndex);
}

/**
 * Prepares observations for tree building.
 * Cleans orphaned parent references and sorts by startTime.
 * Returns flat array (nesting happens in buildDependencyGraph).
 */
function prepareObservations(list: ObservationReturnType[]): {
  sortedObservations: ObservationReturnType[];
} {
  if (list.length === 0) return { sortedObservations: [] };

  // Build a Set of all observation IDs for O(1) lookup
  const observationIds = new Set(list.map((o) => o.id));

  // Remove parentObservationId if parent doesn't exist in the list
  const mutableList = list.map((o) => {
    if (o.parentObservationId && !observationIds.has(o.parentObservationId)) {
      return { ...o, parentObservationId: null };
    }
    return o;
  });

  // Sort by start time
  const sortedObservations = mutableList.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  return { sortedObservations };
}

/**
 * Phase 2: Builds dependency graph for bottom-up tree construction.
 * Creates ProcessingNodes with parent-child relationships via IDs.
 * Calculates in-degrees for topological sort (children count per node).
 * Calculates depth for each node based on parent relationships.
 */
function buildDependencyGraph(sortedObservations: ObservationReturnType[]): {
  nodeRegistry: Map<string, ProcessingNode>;
  leafIds: string[];
} {
  const nodeRegistry = new Map<string, ProcessingNode>();

  // First pass: create all ProcessingNodes with initial depth
  for (const obs of sortedObservations) {
    nodeRegistry.set(obs.id, {
      observation: obs,
      childrenIds: [],
      inDegree: 0,
      depth: 0, // Will be calculated in third pass
      treeNode: undefined,
    });
  }

  // Second pass: build parent-child relationships
  for (const obs of sortedObservations) {
    if (obs.parentObservationId) {
      const parent = nodeRegistry.get(obs.parentObservationId);
      if (parent) {
        parent.childrenIds.push(obs.id);
      }
    }
  }

  // Third pass: calculate depth top-down using BFS
  const rootIds: string[] = [];
  for (const [id, node] of nodeRegistry) {
    if (!node.observation.parentObservationId) {
      rootIds.push(id);
      node.depth = 0;
    }
  }

  // BFS to propagate depth down the tree
  const queue = [...rootIds];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const currentId = queue[queueIndex++];
    const currentNode = nodeRegistry.get(currentId)!;

    for (const childId of currentNode.childrenIds) {
      const childNode = nodeRegistry.get(childId)!;
      childNode.depth = currentNode.depth + 1;
      queue.push(childId);
    }
  }

  // Fourth pass: calculate in-degrees and identify leaf nodes
  // Note: Children are already in correct order because observations are pre-sorted
  // by startTime in prepareObservations, and children are added in iteration order.
  const leafIds: string[] = [];
  for (const [id, node] of nodeRegistry) {
    // Set in-degree to children count (for topological sort)
    node.inDegree = node.childrenIds.length;

    // Track leaf nodes (no children = ready to process first)
    if (node.childrenIds.length === 0) {
      leafIds.push(id);
    }
  }

  return { nodeRegistry, leafIds };
}

/**
 * Phase 3: Builds TreeNodes bottom-up using topological sort.
 * Processes leaf nodes first, then parents once all children are processed.
 * Calculates costs bottom-up: node cost + aggregated children costs.
 * Also calculates temporal properties (startTimeSinceTrace, startTimeSinceParentStart) and depth.
 */
function buildTreeNodesBottomUp(
  nodeRegistry: Map<string, ProcessingNode>,
  leafIds: string[],
  nodeMap: Map<string, TreeNode>,
  traceStartTime: Date,
): string[] {
  // Queue starts with all leaf nodes (inDegree === 0)
  // Use index-based traversal instead of shift() for O(1) dequeue (shift is O(N))
  const queue = [...leafIds];
  let queueIndex = 0;
  const rootIds: string[] = [];

  while (queueIndex < queue.length) {
    const currentId = queue[queueIndex++];
    const currentNode = nodeRegistry.get(currentId)!;
    const obs = currentNode.observation;

    // Get child TreeNodes (already processed)
    const childTreeNodes: TreeNode[] = [];
    for (const childId of currentNode.childrenIds) {
      const childNode = nodeRegistry.get(childId)!;
      if (childNode.treeNode) {
        childTreeNodes.push(childNode.treeNode);
      }
    }

    // Calculate this node's own cost
    let nodeCost: Decimal | undefined;

    if (obs.totalCost != null) {
      const cost = new Decimal(obs.totalCost);
      if (!cost.isZero()) {
        nodeCost = cost;
      }
    } else if (obs.inputCost != null || obs.outputCost != null) {
      const inputCost =
        obs.inputCost != null ? new Decimal(obs.inputCost) : new Decimal(0);
      const outputCost =
        obs.outputCost != null ? new Decimal(obs.outputCost) : new Decimal(0);
      const combinedCost = inputCost.plus(outputCost);
      if (!combinedCost.isZero()) {
        nodeCost = combinedCost;
      }
    }

    // Sum children's total costs (already computed bottom-up)
    const childrenTotalCost = childTreeNodes.reduce<Decimal | undefined>(
      (acc, child) => {
        if (!child.totalCost) return acc;
        return acc ? acc.plus(child.totalCost) : child.totalCost;
      },
      undefined,
    );

    // Total = node cost + children costs
    const totalCost =
      nodeCost && childrenTotalCost
        ? nodeCost.plus(childrenTotalCost)
        : nodeCost || childrenTotalCost;

    // Calculate temporal and structural properties
    const startTimeSinceTrace =
      obs.startTime.getTime() - traceStartTime.getTime();

    let startTimeSinceParentStart: number | null = null;

    if (obs.parentObservationId) {
      const parentNode = nodeRegistry.get(obs.parentObservationId);
      if (parentNode) {
        startTimeSinceParentStart =
          obs.startTime.getTime() - parentNode.observation.startTime.getTime();
      }
    }

    // Use pre-calculated depth from ProcessingNode
    const depth = currentNode.depth;

    // Calculate childrenDepth (max depth of subtree rooted at this node)
    // Leaf nodes have childrenDepth = 0
    // Parent nodes have childrenDepth = max(children.childrenDepth) + 1
    const childrenDepth =
      childTreeNodes.length > 0
        ? Math.max(...childTreeNodes.map((c) => c.childrenDepth)) + 1
        : 0;

    // Create TreeNode
    const treeNode: TreeNode = {
      id: obs.id,
      type: obs.type,
      name: obs.name ?? "",
      startTime: obs.startTime,
      endTime: obs.endTime,
      level: obs.level,
      children: childTreeNodes,
      inputUsage: obs.inputUsage,
      outputUsage: obs.outputUsage,
      totalUsage: obs.totalUsage,
      calculatedInputCost: obs.inputCost,
      calculatedOutputCost: obs.outputCost,
      calculatedTotalCost: obs.totalCost,
      parentObservationId: obs.parentObservationId,
      traceId: obs.traceId,
      totalCost,
      startTimeSinceTrace,
      startTimeSinceParentStart,
      depth,
      childrenDepth,
    };

    // Store in registry and nodeMap
    currentNode.treeNode = treeNode;
    nodeMap.set(currentId, treeNode);

    // Decrement parent's in-degree and queue if ready
    if (obs.parentObservationId) {
      const parent = nodeRegistry.get(obs.parentObservationId);
      if (parent) {
        parent.inDegree--;
        if (parent.inDegree === 0) {
          queue.push(obs.parentObservationId);
        }
      }
    } else {
      // No parent = root observation
      rootIds.push(currentId);
    }
  }

  return rootIds;
}

/**
 * Builds hierarchical tree from trace and observations (ITERATIVE - optimal).
 * Uses topological sort for bottom-up cost aggregation.
 * Handles unlimited tree depth without stack overflow.
 *
 * Returns `roots` array:
 * - Traditional traces: [TRACE node] with observations as children
 * - Events-based traces (rootObservationType set): [obs1, obs2, ...] directly. Array because there could be multiple roots now
 */
function buildTraceTree(
  trace: TraceType,
  observations: ObservationReturnType[],
): {
  roots: TreeNode[];
  nodeMap: Map<string, TreeNode>;
} {
  // Phase 1: Prepare observations (sort, clean orphaned parents)
  const { sortedObservations } = prepareObservations(observations);

  // Handle empty case
  if (sortedObservations.length === 0) {
    // For events-based traces with no observations, return empty roots
    if (trace.rootObservationType) {
      return { roots: [], nodeMap: new Map() };
    }

    // Traditional traces: return TRACE node with no children
    const emptyTree: TreeNode = {
      id: `trace-${trace.id}`,
      type: "TRACE",
      name: trace.name ?? "",
      startTime: trace.timestamp,
      endTime: null,
      children: [],
      latency: trace.latency,
      totalCost: undefined,
      startTimeSinceTrace: 0,
      startTimeSinceParentStart: null,
      // depth: -1 for TRACE wrapper so its children (observations) start at depth 0
      depth: -1,
      childrenDepth: 0,
    };
    const nodeMap = new Map<string, TreeNode>();
    nodeMap.set(emptyTree.id, emptyTree);
    return { roots: [emptyTree], nodeMap };
  }

  // Phase 2: Build dependency graph
  const { nodeRegistry, leafIds } = buildDependencyGraph(sortedObservations);

  // Phase 3: Build TreeNodes bottom-up with cost aggregation
  const nodeMap = new Map<string, TreeNode>();
  const rootIds = buildTreeNodesBottomUp(
    nodeRegistry,
    leafIds,
    nodeMap,
    trace.timestamp,
  );

  // Phase 4: Build roots array
  const rootTreeNodes: TreeNode[] = [];
  for (const rootId of rootIds) {
    const rootNode = nodeRegistry.get(rootId)!;
    if (rootNode.treeNode) {
      rootTreeNodes.push(rootNode.treeNode);
    }
  }

  // Sort roots by startTime for consistent ordering
  rootTreeNodes.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Events-based traces (rootObservationType set): return observations as roots directly
  if (trace.rootObservationType) {
    return { roots: rootTreeNodes, nodeMap };
  }

  // Traditional traces: wrap in TRACE node

  // Calculate trace root total cost
  const traceTotalCost = rootTreeNodes.reduce<Decimal | undefined>(
    (acc, child) => {
      if (!child.totalCost) return acc;
      return acc ? acc.plus(child.totalCost) : child.totalCost;
    },
    undefined,
  );

  // Calculate trace root childrenDepth
  const traceChildrenDepth =
    rootTreeNodes.length > 0
      ? Math.max(...rootTreeNodes.map((c) => c.childrenDepth)) + 1
      : 0;

  // Create trace root node
  const traceNode: TreeNode = {
    id: `trace-${trace.id}`,
    type: "TRACE",
    name: trace.name ?? "",
    startTime: trace.timestamp,
    endTime: null,
    children: rootTreeNodes,
    latency: trace.latency,
    totalCost: traceTotalCost,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    // depth: -1 for TRACE wrapper so its children (observations) start at depth 0
    depth: -1,
    childrenDepth: traceChildrenDepth,
  };

  nodeMap.set(traceNode.id, traceNode);

  return { roots: [traceNode], nodeMap };
}

/**
 * Main entry point: builds complete UI data from trace and observations.
 *
 * Level filtering (hiding DEBUG observations etc.) is NOT done here.
 * Use removeHiddenNodes() on the returned roots to filter by level in the display layer.
 *
 * Returns:
 * - roots: Array of root TreeNodes (single TRACE root for traditional, multiple obs roots for events-based)
 * - nodeMap: Map<id, TreeNode> for O(1) lookup
 * - searchItems: Flattened list for search/virtualized rendering
 */
export function buildTraceUiData(
  trace: TraceType,
  observations: ObservationReturnType[],
): {
  roots: TreeNode[];
  searchItems: TraceSearchListItem[];
  nodeMap: Map<string, TreeNode>;
} {
  const { roots, nodeMap } = buildTraceTree(trace, observations);

  // Handle empty roots case
  if (roots.length === 0) {
    return { roots, searchItems: [], nodeMap };
  }

  // TODO: Extract aggregation logic to shared utility - duplicated in TraceTree.tsx and TraceTimeline/index.tsx
  // Calculate aggregated totals across all roots for heatmap scaling
  const rootTotalCost = roots.reduce<Decimal | undefined>((acc, r) => {
    if (!r.totalCost) return acc;
    return acc ? acc.plus(r.totalCost) : r.totalCost;
  }, undefined);

  const rootDuration =
    roots.length > 0
      ? Math.max(
          ...roots.map((r) =>
            r.latency
              ? r.latency * 1000
              : r.endTime
                ? r.endTime.getTime() - r.startTime.getTime()
                : 0,
          ),
        )
      : undefined;

  // Build flat search items list (iterative to avoid stack overflow on deep trees)
  const searchItems: TraceSearchListItem[] = [];

  // Initialize stack with all roots (in reverse order for correct DFS traversal)
  const stack: TreeNode[] = [];
  for (let i = roots.length - 1; i >= 0; i--) {
    stack.push(roots[i]!);
  }

  while (stack.length > 0) {
    const node = stack.pop()!;
    searchItems.push({
      node,
      parentTotalCost: rootTotalCost,
      parentTotalDuration: rootDuration,
      observationId: node.type === "TRACE" ? undefined : node.id,
    });
    // Push children in reverse order to maintain depth-first left-to-right traversal
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }

  return { roots, searchItems, nodeMap };
}

/**
 * Removes nodes matching a predicate from a tree, promoting their children
 * to the parent level. Useful for hiding observations by level (e.g. DEBUG)
 * without breaking the tree structure.
 *
 * This is applied as a display-layer post-processing step, keeping the
 * tree-building data layer clean and free of level-filtering concerns.
 *
 * Implemented iteratively to avoid call stack overflows on deeply nested traces.
 * Uses a single-pass stack algorithm to keep complexity linear in node count.
 */
export function removeHiddenNodes(
  nodes: TreeNode[],
  isHidden: (node: TreeNode) => boolean,
): TreeNode[] {
  if (nodes.length === 0) return [];

  const result: TreeNode[] = [];

  // Each stack entry carries the output array where this node should be attached.
  // Hidden nodes are skipped and their children are redirected to the same target.
  const stack: Array<{ node: TreeNode; target: TreeNode[] }> = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({ node: nodes[i]!, target: result });
  }

  while (stack.length > 0) {
    const { node, target } = stack.pop()!;

    if (isHidden(node)) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push({ node: node.children[i]!, target });
      }
      continue;
    }

    const clone: TreeNode = { ...node, children: [] };
    target.push(clone);

    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({ node: node.children[i]!, target: clone.children });
    }
  }

  return result;
}
