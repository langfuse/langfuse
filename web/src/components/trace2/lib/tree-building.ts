/**
 * Tree building utilities for trace component.
 *
 * IMPLEMENTATION APPROACH:
 * Uses fully iterative algorithms (no recursion) to avoid stack overflow on deep trees (10k+ depth).
 *
 * Algorithm Overview:
 * 1. Filter observations by level threshold and sort by startTime
 * 2. Build dependency graph: Map-based parent-child relationships (O(N))
 * 3. Topological sort: Process nodes bottom-up (leaves first) using queue with index-based traversal
 * 4. Cost aggregation: Compute bottom-up during tree construction (children before parents)
 * 5. Flatten to searchItems: Iterative pre-order traversal using explicit stack
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
function getObservationLevels(minLevel: ObservationLevelType | undefined) {
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
 * Filters and prepares observations for tree building.
 * Filters by minimum observation level, cleans orphaned parents, and sorts by startTime.
 * Returns flat array (nesting happens in buildDependencyGraph).
 */
function filterAndPrepareObservations(
  list: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  sortedObservations: ObservationReturnType[];
  hiddenObservationsCount: number;
} {
  if (list.length === 0)
    return { sortedObservations: [], hiddenObservationsCount: 0 };

  // Filter for observations with minimum level
  const mutableList = list.filter((o) =>
    getObservationLevels(minLevel).includes(o.level),
  );
  const hiddenObservationsCount = list.length - mutableList.length;

  // Build a Set of all observation IDs for O(1) lookup
  const observationIds = new Set(list.map((o) => o.id));

  // Remove parentObservationId if parent doesn't exist
  mutableList.forEach((observation) => {
    if (
      observation.parentObservationId &&
      !observationIds.has(observation.parentObservationId)
    ) {
      observation.parentObservationId = null;
    }
  });

  // Sort by start time
  const sortedObservations = mutableList.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  return {
    sortedObservations,
    hiddenObservationsCount,
  };
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
  // by startTime in filterAndPrepareObservations, and children are added in iteration order.
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
 */
function buildTraceTree(
  trace: TraceType,
  observations: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  tree: TreeNode;
  hiddenObservationsCount: number;
  nodeMap: Map<string, TreeNode>;
} {
  // Phase 1: Filter and prepare observations
  const { sortedObservations, hiddenObservationsCount } =
    filterAndPrepareObservations(observations, minLevel);

  // Handle empty case
  if (sortedObservations.length === 0) {
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
      depth: -1,
      childrenDepth: 0,
    };
    const nodeMap = new Map<string, TreeNode>();
    nodeMap.set(emptyTree.id, emptyTree);
    return { tree: emptyTree, hiddenObservationsCount, nodeMap };
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

  // Phase 4: Build trace root
  const rootTreeNodes: TreeNode[] = [];
  for (const rootId of rootIds) {
    const rootNode = nodeRegistry.get(rootId)!;
    if (rootNode.treeNode) {
      rootTreeNodes.push(rootNode.treeNode);
    }
  }

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
  const tree: TreeNode = {
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
    depth: -1,
    childrenDepth: traceChildrenDepth,
  };

  nodeMap.set(tree.id, tree);

  return { tree, hiddenObservationsCount, nodeMap };
}

/**
 * Main entry point: builds complete UI data from trace and observations.
 *
 * Returns:
 * - tree: Hierarchical TreeNode structure with trace as root
 * - nodeMap: Map<id, TreeNode> for O(1) lookup
 * - searchItems: Flattened list for search/virtualized rendering
 * - hiddenObservationsCount: Number filtered by minLevel
 */
export function buildTraceUiData(
  trace: TraceType,
  observations: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  tree: TreeNode;
  hiddenObservationsCount: number;
  searchItems: TraceSearchListItem[];
  nodeMap: Map<string, TreeNode>;
} {
  const { tree, hiddenObservationsCount, nodeMap } = buildTraceTree(
    trace,
    observations,
    minLevel,
  );

  // Use pre-computed totals for heatmap scaling (computed in buildTreeNodesBottomUp)
  const rootTotalCost = tree.totalCost;
  const rootDuration = tree.latency ? tree.latency * 1000 : undefined;

  // Build flat search items list (iterative to avoid stack overflow on deep trees)
  const searchItems: TraceSearchListItem[] = [];
  const stack: TreeNode[] = [tree];

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

  return { tree, hiddenObservationsCount, searchItems, nodeMap };
}
