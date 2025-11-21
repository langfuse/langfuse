/**
 * Tree building utilities for trace2 component.
 *
 * Transforms flat observation arrays into hierarchical TreeNode structures.
 * Includes cost aggregation computed bottom-up for O(1) access.
 *
 * Main export: buildTraceUiData() - builds tree, nodeMap, and searchItems from trace + observations.
 */

import { type NestedObservation } from "@/src/utils/types";
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
 * Nests flat observation array into parent-child hierarchy.
 * Filters by minimum observation level and sorts by startTime.
 */
function nestObservations(
  list: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  nestedObservations: NestedObservation[];
  hiddenObservationsCount: number;
} {
  if (list.length === 0)
    return { nestedObservations: [], hiddenObservationsCount: 0 };

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

  // Create map with children arrays
  const map = new Map<string, NestedObservation>();
  for (const obj of sortedObservations) {
    map.set(obj.id, { ...obj, children: [] });
  }

  // Build roots map
  const roots = new Map<string, NestedObservation>();

  // Populate children arrays and root map
  for (const obj of map.values()) {
    if (obj.parentObservationId) {
      const parent = map.get(obj.parentObservationId);
      if (parent) {
        parent.children.push(obj);
      }
    } else {
      roots.set(obj.id, obj);
    }
  }

  // Sort children by start time
  for (const obj of map.values()) {
    obj.children.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  return {
    nestedObservations: Array.from(roots.values()),
    hiddenObservationsCount,
  };
}

/**
 * Enriches tree nodes with pre-computed costs (bottom-up aggregation).
 * Also populates nodeMap for O(1) lookup by ID.
 */
function enrichTreeNodeWithCosts(
  node: TreeNode,
  nodeMap: Map<string, TreeNode>,
): TreeNode {
  // Recursively enrich children first
  const enrichedChildren = node.children.map((child) =>
    enrichTreeNodeWithCosts(child, nodeMap),
  );

  // Calculate this node's own cost
  let nodeCost: Decimal | undefined;

  if (node.calculatedTotalCost != null) {
    const cost = new Decimal(node.calculatedTotalCost);
    if (!cost.isZero()) {
      nodeCost = cost;
    }
  } else if (
    node.calculatedInputCost != null ||
    node.calculatedOutputCost != null
  ) {
    const inputCost =
      node.calculatedInputCost != null
        ? new Decimal(node.calculatedInputCost)
        : new Decimal(0);
    const outputCost =
      node.calculatedOutputCost != null
        ? new Decimal(node.calculatedOutputCost)
        : new Decimal(0);
    const combinedCost = inputCost.plus(outputCost);
    if (!combinedCost.isZero()) {
      nodeCost = combinedCost;
    }
  }

  // Sum children's total costs
  const childrenTotalCost = enrichedChildren.reduce<Decimal | undefined>(
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

  const enrichedNode = {
    ...node,
    children: enrichedChildren,
    totalCost,
  };

  nodeMap.set(enrichedNode.id, enrichedNode);
  return enrichedNode;
}

/**
 * Builds hierarchical tree from trace and observations.
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
  const { nestedObservations, hiddenObservationsCount } = nestObservations(
    observations,
    minLevel,
  );

  const nodeMap = new Map<string, TreeNode>();

  // Convert observations to TreeNodes
  const convertObservationToTreeNode = (obs: NestedObservation): TreeNode => ({
    id: obs.id,
    type: obs.type,
    name: obs.name ?? "",
    startTime: obs.startTime,
    endTime: obs.endTime,
    level: obs.level,
    children: obs.children.map(convertObservationToTreeNode),
    inputUsage: obs.inputUsage,
    outputUsage: obs.outputUsage,
    totalUsage: obs.totalUsage,
    calculatedInputCost: obs.inputCost,
    calculatedOutputCost: obs.outputCost,
    calculatedTotalCost: obs.totalCost,
    parentObservationId: obs.parentObservationId,
    traceId: obs.traceId,
  });

  // Convert and enrich with costs
  const enrichedChildren = nestedObservations
    .map(convertObservationToTreeNode)
    .map((node) => enrichTreeNodeWithCosts(node, nodeMap));

  // Calculate trace root total cost
  const traceTotalCost = enrichedChildren.reduce<Decimal | undefined>(
    (acc, child) => {
      if (!child.totalCost) return acc;
      return acc ? acc.plus(child.totalCost) : child.totalCost;
    },
    undefined,
  );

  // Create trace root node
  const tree: TreeNode = {
    id: `trace-${trace.id}`,
    type: "TRACE",
    name: trace.name ?? "",
    startTime: trace.timestamp,
    endTime: null,
    children: enrichedChildren,
    latency: trace.latency,
    totalCost: traceTotalCost,
  };

  nodeMap.set(tree.id, tree);

  return { tree, hiddenObservationsCount, nodeMap };
}

/**
 * Calculates total cost for a tree node and all descendants.
 */
function calculateTreeNodeTotalCost(node: TreeNode): Decimal | undefined {
  let nodeCost: Decimal | undefined;

  if (node.calculatedTotalCost != null) {
    const cost = new Decimal(node.calculatedTotalCost);
    if (!cost.isZero()) {
      nodeCost = cost;
    }
  } else if (
    node.calculatedInputCost != null ||
    node.calculatedOutputCost != null
  ) {
    const inputCost =
      node.calculatedInputCost != null
        ? new Decimal(node.calculatedInputCost)
        : new Decimal(0);
    const outputCost =
      node.calculatedOutputCost != null
        ? new Decimal(node.calculatedOutputCost)
        : new Decimal(0);
    const combinedCost = inputCost.plus(outputCost);
    if (!combinedCost.isZero()) {
      nodeCost = combinedCost;
    }
  }

  const childrenCost = node.children.reduce<Decimal | undefined>(
    (acc, child) => {
      const childCost = calculateTreeNodeTotalCost(child);
      if (!childCost) return acc;
      return acc ? acc.plus(childCost) : childCost;
    },
    undefined,
  );

  if (nodeCost && childrenCost) {
    return nodeCost.plus(childrenCost);
  }
  return nodeCost || childrenCost;
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

  // Calculate root totals for heatmap scaling
  const rootTotalCost =
    tree.type === "TRACE"
      ? tree.children.reduce<Decimal | undefined>((acc, child) => {
          const childCost = calculateTreeNodeTotalCost(child);
          if (!childCost) return acc;
          return acc ? acc.plus(childCost) : childCost;
        }, undefined)
      : calculateTreeNodeTotalCost(tree);
  const rootDuration = tree.latency ? tree.latency * 1000 : undefined;

  // Build flat search items list
  const searchItems: TraceSearchListItem[] = [];
  const visit = (node: TreeNode) => {
    searchItems.push({
      node,
      parentTotalCost: rootTotalCost,
      parentTotalDuration: rootDuration,
      observationId: node.type === "TRACE" ? undefined : node.id,
    });
    node.children.forEach(visit);
  };
  visit(tree);

  return { tree, hiddenObservationsCount, searchItems, nodeMap };
}
