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

export function nestObservations(
  list: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  nestedObservations: NestedObservation[];
  hiddenObservationsCount: number;
} {
  if (list.length === 0)
    return { nestedObservations: [], hiddenObservationsCount: 0 };

  // Data prep:
  // - Filter for observations with minimum level
  // - Remove parentObservationId attribute from observations if the id does not exist in the list of observations
  const mutableList = list.filter((o) =>
    getObservationLevels(minLevel).includes(o.level),
  );
  const hiddenObservationsCount = list.length - mutableList.length;

  // Build a Set of all observation IDs for O(1) lookup instead of O(n) find
  const observationIds = new Set(list.map((o) => o.id));

  mutableList.forEach((observation) => {
    if (
      observation.parentObservationId &&
      !observationIds.has(observation.parentObservationId)
    ) {
      observation.parentObservationId = null;
    }
  });

  // Step 0: Sort the list by start time to ensure observations are in right order
  const sortedObservations = mutableList.sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  // Step 1: Create a map where the keys are object IDs, and the values are
  // the corresponding objects with an added 'children' property.
  const map = new Map<string, NestedObservation>();
  for (const obj of sortedObservations) {
    map.set(obj.id, { ...obj, children: [] });
  }

  // Step 2: Create another map for the roots of all trees.
  const roots = new Map<string, NestedObservation>();

  // Step 3: Populate the 'children' arrays and root map.
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

  // Step 4: Sort children by start time for each parent
  for (const obj of map.values()) {
    obj.children.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }

  // Step 5: Return the roots.
  return {
    nestedObservations: Array.from(roots.values()),
    hiddenObservationsCount,
  };
}

export function calculateDisplayTotalCost(p: {
  allObservations: ObservationReturnType[];
  rootObservationId?: string;
}): Decimal | undefined {
  // if parentObservationId is provided, only calculate cost for children of that observation
  // need to be checked recursively for all children and children of children
  // loop until no more children to be added
  let observations = p.allObservations;

  if (p.rootObservationId) {
    observations = observations.filter(
      (o) =>
        o.parentObservationId === p.rootObservationId ||
        o.id === p.rootObservationId,
    );

    while (true) {
      const childrenToAdd = p.allObservations.filter(
        (o) =>
          o.parentObservationId &&
          !observations.map((o2) => o2.id).includes(o.id) &&
          observations.map((o2) => o2.id).includes(o.parentObservationId),
      );
      if (childrenToAdd.length === 0) break;
      observations = [...observations, ...childrenToAdd];
    }
  }

  const totalCost = observations.reduce<Decimal | undefined>(
    (prev: Decimal | undefined, curr: ObservationReturnType) => {
      // if we don't have any calculated costs, we can't do anything
      if (!curr.totalCost && !curr.inputCost && !curr.outputCost) return prev;

      // if we have either input or output cost, but not total cost, we can use that
      if (!curr.totalCost && (curr.inputCost || curr.outputCost)) {
        const inputCost =
          curr.inputCost != null ? new Decimal(curr.inputCost) : new Decimal(0);

        const outputCost =
          curr.outputCost != null
            ? new Decimal(curr.outputCost)
            : new Decimal(0);

        const combinedCost = inputCost.plus(outputCost);

        return prev
          ? prev.plus(combinedCost)
          : combinedCost.isZero()
            ? undefined
            : combinedCost;
      }

      if (!curr.totalCost) return prev;

      // if we have total cost, we can use that
      return prev ? prev.plus(curr.totalCost) : new Decimal(curr.totalCost);
    },
    undefined,
  );

  return totalCost;
}

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

export const heatMapTextColor = (p: {
  min?: Decimal | number;
  max: Decimal | number;
  value: Decimal | number;
}) => {
  const { min, max, value } = p;
  const minDecimal = min ? new Decimal(min) : new Decimal(0);
  const maxDecimal = new Decimal(max);
  const valueDecimal = new Decimal(value);

  const cutOffs: [number, string][] = [
    [0.75, "text-dark-red"], // 75%
    [0.5, "text-dark-yellow"], // 50%
  ];
  const standardizedValueOnStartEndScale = valueDecimal
    .sub(minDecimal)
    .div(maxDecimal.sub(minDecimal));
  const ratio = standardizedValueOnStartEndScale.toNumber();

  // pick based on ratio if threshold is exceeded
  for (const [threshold, color] of cutOffs) {
    if (ratio >= threshold) {
      return color;
    }
  }
  return "";
};

// Helper function to unnest observations for cost calculation
export const unnestObservation = (nestedObservation: NestedObservation) => {
  const unnestedObservations = [];
  const { children, ...observation } = nestedObservation;
  unnestedObservations.push(observation);
  children.forEach((child) => {
    unnestedObservations.push(...unnestObservation(child));
  });
  return unnestedObservations;
};

// Transform trace + observations into unified tree structure
// Helper function to compute and enrich tree nodes with pre-computed costs
// This is done bottom-up: compute children first, then sum up to parent
// Also populates the nodeMap for O(1) lookup by ID
function enrichTreeNodeWithCosts(
  node: TreeNode,
  nodeMap: Map<string, TreeNode>,
): TreeNode {
  // First, recursively enrich all children
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

  // Sum up all children's total costs
  const childrenTotalCost = enrichedChildren.reduce<Decimal | undefined>(
    (acc, child) => {
      if (!child.totalCost) return acc;
      return acc ? acc.plus(child.totalCost) : child.totalCost;
    },
    undefined,
  );

  // Total cost = this node's cost + all children's costs
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

// This function is only used internally by buildTraceUiData
function buildTraceTree(
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
    latency?: number;
  },
  observations: ObservationReturnType[],
  minLevel?: ObservationLevelType,
): {
  tree: TreeNode;
  hiddenObservationsCount: number;
  nodeMap: Map<string, TreeNode>;
} {
  // First, nest the observations as before
  const { nestedObservations, hiddenObservationsCount } = nestObservations(
    observations,
    minLevel,
  );

  // Create nodeMap for O(1) lookup by ID
  const nodeMap = new Map<string, TreeNode>();

  // Convert observations to TreeNodes with temporal and depth properties
  const convertObservationToTreeNode = (
    obs: NestedObservation,
    traceStartTime: Date,
    parentStartTime: Date | null,
    depth: number,
  ): TreeNode => {
    const children = obs.children.map((child) =>
      convertObservationToTreeNode(
        child,
        traceStartTime,
        obs.startTime,
        depth + 1,
      ),
    );

    // Calculate childrenDepth (max depth of subtree rooted at this node)
    const childrenDepth =
      children.length > 0
        ? Math.max(...children.map((c) => c.childrenDepth)) + 1
        : 0;

    return {
      id: obs.id,
      type: obs.type,
      name: obs.name ?? "",
      startTime: obs.startTime,
      endTime: obs.endTime,
      level: obs.level,
      children,
      inputUsage: obs.inputUsage,
      outputUsage: obs.outputUsage,
      totalUsage: obs.totalUsage,
      calculatedInputCost: obs.inputCost,
      calculatedOutputCost: obs.outputCost,
      calculatedTotalCost: obs.totalCost,
      parentObservationId: obs.parentObservationId,
      traceId: obs.traceId,
      startTimeSinceTrace: obs.startTime.getTime() - traceStartTime.getTime(),
      startTimeSinceParentStart:
        parentStartTime !== null
          ? obs.startTime.getTime() - parentStartTime.getTime()
          : null,
      depth,
      childrenDepth,
    };
  };

  // Convert and enrich children with pre-computed costs and populate nodeMap
  const enrichedChildren = nestedObservations
    .map((obs) => convertObservationToTreeNode(obs, trace.timestamp, null, 0))
    .map((node) => enrichTreeNodeWithCosts(node, nodeMap));

  // Calculate total cost for trace root (sum of all top-level children)
  const traceTotalCost = enrichedChildren.reduce<Decimal | undefined>(
    (acc, child) => {
      if (!child.totalCost) return acc;
      return acc ? acc.plus(child.totalCost) : child.totalCost;
    },
    undefined,
  );

  // Calculate childrenDepth for trace root
  const traceChildrenDepth =
    enrichedChildren.length > 0
      ? Math.max(...enrichedChildren.map((c) => c.childrenDepth)) + 1
      : 0;

  // Create the root tree node (trace)
  // Use a unique ID for the trace root to avoid conflicts with observations that might have the same ID
  const tree: TreeNode = {
    id: `trace-${trace.id}`,
    type: "TRACE",
    name: trace.name ?? "",
    startTime: trace.timestamp,
    endTime: null, // traces don't have explicit end times
    children: enrichedChildren,
    latency: trace.latency,
    totalCost: traceTotalCost,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    depth: -1,
    childrenDepth: traceChildrenDepth,
  };

  // Add trace root to nodeMap as well
  nodeMap.set(tree.id, tree);

  return { tree, hiddenObservationsCount, nodeMap };
}

// UI helper: build flat search items with per-node aggregated totals and root-level parent totals for heatmap scaling

export function buildTraceUiData(
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    input: string | null;
    output: string | null;
    latency?: number;
  },
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

  // Calculate total cost directly from TreeNode structure
  // This avoids unnecessary type conversions and is more straightforward
  const calculateTreeNodeTotalCost = (node: TreeNode): Decimal | undefined => {
    // Check if this node has cost data
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

    // Calculate total from all children
    const childrenCost = node.children.reduce<Decimal | undefined>(
      (acc, child) => {
        const childCost = calculateTreeNodeTotalCost(child);
        if (!childCost) return acc;
        return acc ? acc.plus(childCost) : childCost;
      },
      undefined,
    );

    // Return the sum of node cost and children cost
    if (nodeCost && childrenCost) {
      return nodeCost.plus(childrenCost);
    }
    return nodeCost || childrenCost;
  };

  const rootTotalCost =
    tree.type === "TRACE"
      ? tree.children.reduce<Decimal | undefined>((acc, child) => {
          const childCost = calculateTreeNodeTotalCost(child);
          if (!childCost) return acc;
          return acc ? acc.plus(childCost) : childCost;
        }, undefined)
      : calculateTreeNodeTotalCost(tree);
  const rootDuration = tree.latency ? tree.latency * 1000 : undefined;

  const out: TraceSearchListItem[] = [];
  const visit = (node: TreeNode) => {
    // push node; SpanItem will compute its own displayed metrics, we only need parent totals for heatmap
    out.push({
      node,
      parentTotalCost: rootTotalCost,
      parentTotalDuration: rootDuration,
      // For TRACE nodes, observationId should be undefined (shows trace overview)
      // For actual observations, use the node ID (which is the real observation ID)
      observationId: node.type === "TRACE" ? undefined : node.id,
    });
    node.children.forEach(visit);
  };
  visit(tree);

  return { tree, hiddenObservationsCount, searchItems: out, nodeMap };
}

/**
 * Download trace data with optionally observations as JSON file
 * @param trace - Trace object to download
 * @param observations - Array of observations (can be basic or with full I/O data)
 * @param filename - Optional custom filename (defaults to trace-{traceId}.json)
 */
export function downloadTraceAsJson(params: {
  trace: {
    id: string;
    [key: string]: unknown;
  };
  observations: unknown[];
  filename?: string;
}) {
  const { trace, observations, filename } = params;

  const exportData = {
    trace,
    observations,
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename || `trace-${trace.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
