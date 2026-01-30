/**
 * Tree-based JSON structure for JIT rendering
 *
 * Instead of eager flattening, we build a hierarchical tree that mirrors the JSON structure.
 * This allows for O(log n) row lookup via getNodeByIndex instead of O(n) full traversal.
 *
 * Key concepts:
 * - TreeNode: Hierarchical structure with parent/child references
 * - childOffsets: Cumulative counts for binary search navigation
 * - Three-pass build: structure → expansion → offsets
 * - All operations are ITERATIVE (stack-based) to avoid stack overflow
 */

import type { ExpansionState } from "../types";
import { getJSONType, isExpandable, getChildren } from "./jsonTypes";
import { joinPath } from "./pathUtils";
import { debugLog } from "./debug";
import {
  calculateNodeWidth,
  type WidthEstimatorConfig,
} from "./calculateWidth";

/**
 * Size threshold for sync vs Web Worker
 * Tree building with >10K nodes can block main thread for 50ms+
 */
export const TREE_BUILD_THRESHOLD = 10_000;

/**
 * TreeNode represents a single node in the hierarchical JSON tree
 */
export interface TreeNode {
  // Identity
  id: string; // Full path as string (e.g., "root.users.0.name")
  key: string | number; // Key in parent (e.g., "users", 0, "name")
  pathArray: (string | number)[]; // Path as array (e.g., ["root", "users", 0, "name"])

  // Value
  value: unknown; // The actual JSON value
  type:
    | "null"
    | "boolean"
    | "number"
    | "string"
    | "array"
    | "object"
    | "undefined";

  // Structure
  depth: number; // Nesting level (0 = root)
  parentNode: TreeNode | null; // Reference to parent (null for root)
  children: TreeNode[]; // Array of child nodes (empty for primitives)
  childCount: number; // Number of direct children

  // Expansion state
  isExpandable: boolean; // Can this node be expanded? (arrays/objects)
  isExpanded: boolean; // Is this node currently expanded?
  userExpand: boolean | undefined; // User's explicit expansion preference (for context sync)

  // Navigation
  childOffsets: number[]; // Cumulative visible descendant counts for binary search
  visibleDescendantCount: number; // Total visible descendants when expanded (0 if collapsed)
  totalDescendantCount?: number; // Total descendants regardless of expansion (for section row counts)

  // Position
  absoluteLineNumber: number; // 1-indexed line number in fully expanded tree
  indexInParent: number; // Index within parent's children array
  isLastChild: boolean; // Is this the last child of parent?

  // Multi-section support (optional, only for multi-root trees)
  nodeType?:
    | "meta"
    | "section-header"
    | "section-footer"
    | "section-spacer"
    | "json"; // Type discriminator
  sectionKey?: string; // Which section this belongs to
  backgroundColor?: string; // Section background color
  sectionLineNumber?: number; // Line number within section (resets per section)
  minHeight?: string; // Minimum height for section content (CSS value)
  spacerHeight?: number; // For section-spacer nodes: height in pixels
}

/**
 * TreeState holds the complete tree structure and lookup maps
 */
export interface TreeState {
  rootNode: TreeNode;
  nodeMap: Map<string, TreeNode>; // Fast lookup by ID
  allNodes: TreeNode[]; // Flat array for search (pre-order traversal)
  totalNodeCount: number; // Total nodes in tree (when fully expanded)
  maxDepth: number; // Maximum depth across entire tree (including collapsed nodes)
  maxContentWidth: number; // Maximum pixel width needed for any row (for horizontal scrolling)
}

/**
 * Stack item for iterative tree traversal
 */
interface StackItem {
  value: unknown;
  key: string | number;
  pathArray: (string | number)[];
  depth: number;
  parentNode: TreeNode | null;
  indexInParent: number;
  isLastChild: boolean;
}

/**
 * Build tree structure from JSON data (PASS 1: Structure only)
 *
 * Uses iterative depth-first traversal to avoid stack overflow.
 * Does NOT make expansion decisions - that happens in PASS 2.
 *
 * @param data - The JSON data to convert to tree
 * @param rootKey - Key for root node
 * @returns Tree structure, node map, and flat array (pre-order)
 */
function buildTreeStructureIterative(
  data: unknown,
  rootKey: string,
): {
  rootNode: TreeNode;
  nodeMap: Map<string, TreeNode>;
} {
  const nodeMap = new Map<string, TreeNode>();

  // Create root node
  const rootId = rootKey;
  const rootType = getJSONType(data);
  const rootExpandable = isExpandable(data);

  const rootNode: TreeNode = {
    id: rootId,
    key: rootKey,
    pathArray: [rootKey],
    value: data,
    type: rootType,
    depth: 0,
    parentNode: null,
    children: [],
    childCount: 0,
    isExpandable: rootExpandable,
    isExpanded: false, // Will be set in PASS 2
    userExpand: undefined,
    childOffsets: [],
    visibleDescendantCount: 0,
    absoluteLineNumber: 1, // Root is line 1
    indexInParent: 0,
    isLastChild: true,
  };

  nodeMap.set(rootId, rootNode);

  // Stack for iterative traversal (LIFO for DFS)
  const stack: StackItem[] = [
    {
      value: data,
      key: rootKey,
      pathArray: [rootKey],
      depth: 0,
      parentNode: null,
      indexInParent: 0,
      isLastChild: true,
    },
  ];

  // Track nodes to populate children arrays
  const nodesToPopulate = new Map<string, TreeNode>();
  nodesToPopulate.set(rootId, rootNode);

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { value, pathArray, depth } = current;

    const currentId = joinPath(pathArray);
    const currentNode = nodesToPopulate.get(currentId);

    // Skip if this is root (already created)
    if (currentId === rootId) {
      // Process children
      if (rootExpandable) {
        const children = getChildren(data);
        rootNode.childCount = children.length;

        // Pre-allocate children array to maintain correct order
        rootNode.children = new Array(children.length);

        // ITERATIVE LOOP 1: Create child nodes in FORWARD order (0 → length-1)
        // This ensures allNodes array is in correct order
        for (let i = 0; i < children.length; i++) {
          const [childKey, childValue] = children[i]!;
          const childPathArray = [...pathArray, childKey];
          const childId = joinPath(childPathArray);
          const isChildLast = i === children.length - 1;

          // Create child node
          const childType = getJSONType(childValue);
          const childExpandable = isExpandable(childValue);

          const childNode: TreeNode = {
            id: childId,
            key: childKey,
            pathArray: childPathArray,
            value: childValue,
            type: childType,
            depth: depth + 1,
            parentNode: rootNode,
            children: [],
            childCount: childExpandable ? getChildren(childValue).length : 0,
            isExpandable: childExpandable,
            isExpanded: false, // Will be set in PASS 2
            userExpand: undefined,
            childOffsets: [],
            visibleDescendantCount: 0,
            absoluteLineNumber: 0, // Will be assigned in separate pre-order pass
            indexInParent: i,
            isLastChild: isChildLast,
          };

          nodeMap.set(childId, childNode);
          rootNode.children[i] = childNode; // Insert at correct index
          nodesToPopulate.set(childId, childNode);
        }

        // ITERATIVE LOOP 2: Push to stack in REVERSE order (length-1 → 0)
        // This ensures LIFO stack produces left-to-right DFS traversal
        for (let i = children.length - 1; i >= 0; i--) {
          const childNode = rootNode.children[i]!;
          stack.push({
            value: childNode.value,
            key: childNode.key,
            pathArray: childNode.pathArray,
            depth: childNode.depth,
            parentNode: rootNode,
            indexInParent: i,
            isLastChild: childNode.isLastChild,
          });
        }
      }
      continue;
    }

    // Process non-root node
    if (currentNode && currentNode.isExpandable) {
      const children = getChildren(value);

      // Pre-allocate children array to maintain correct order
      currentNode.children = new Array(children.length);

      // ITERATIVE LOOP 1: Create child nodes in FORWARD order (0 → length-1)
      // This ensures allNodes array is in correct order
      for (let i = 0; i < children.length; i++) {
        const [childKey, childValue] = children[i]!;
        const childPathArray = [...pathArray, childKey];
        const childId = joinPath(childPathArray);
        const isChildLast = i === children.length - 1;

        // Create child node
        const childType = getJSONType(childValue);
        const childExpandable = isExpandable(childValue);

        const childNode: TreeNode = {
          id: childId,
          key: childKey,
          pathArray: childPathArray,
          value: childValue,
          type: childType,
          depth: depth + 1,
          parentNode: currentNode,
          children: [],
          childCount: childExpandable ? getChildren(childValue).length : 0,
          isExpandable: childExpandable,
          isExpanded: false, // Will be set in PASS 2
          userExpand: undefined,
          childOffsets: [],
          visibleDescendantCount: 0,
          absoluteLineNumber: 0, // Will be assigned in separate pre-order pass
          indexInParent: i,
          isLastChild: isChildLast,
        };

        nodeMap.set(childId, childNode);
        currentNode.children[i] = childNode; // Insert at correct index
        nodesToPopulate.set(childId, childNode);
      }

      // ITERATIVE LOOP 2: Push to stack in REVERSE order (length-1 → 0)
      // This ensures LIFO stack produces left-to-right DFS traversal
      for (let i = children.length - 1; i >= 0; i--) {
        const childNode = currentNode.children[i]!;
        stack.push({
          value: childNode.value,
          key: childNode.key,
          pathArray: childNode.pathArray,
          depth: childNode.depth,
          parentNode: currentNode,
          indexInParent: i,
          isLastChild: childNode.isLastChild,
        });
      }
    }
  }

  return { rootNode, nodeMap };
}

/**
 * Assign line numbers AND rebuild allNodes in pre-order traversal (ITERATIVE)
 *
 * This must be called AFTER the tree structure is complete.
 * Uses iterative pre-order traversal with explicit stack to:
 * 1. Assign absoluteLineNumber sequentially (1, 2, 3...) in visit order
 * 2. Build allNodes array in pre-order (required for search)
 *
 * @param rootNode - Root of the tree
 * @returns allNodes array in pre-order
 */
function assignLineNumbersAndBuildAllNodes(rootNode: TreeNode): TreeNode[] {
  let lineNumber = 0;
  const allNodes: TreeNode[] = [];
  const stack: TreeNode[] = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop()!;

    // Assign line number when visiting (pre-order)
    lineNumber++;
    node.absoluteLineNumber = lineNumber;

    // Add to allNodes in pre-order
    allNodes.push(node);

    // Push children in REVERSE order for left-to-right traversal
    // (LIFO stack means last pushed = first popped)
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]!);
    }
  }

  return allNodes;
}

/**
 * Apply expansion state to tree (PASS 2: Expansion decisions)
 *
 * Uses iterative traversal to apply expansion state from context.
 * Sets isExpanded and userExpand for each node.
 *
 * @param rootNode - The root of the tree
 * @param expansionState - Boolean or per-path expansion state
 * @param expandDepth - Optional depth to expand to (overrides expansionState)
 */
function applyExpansionStateIterative(
  rootNode: TreeNode,
  expansionState: ExpansionState,
  expandDepth?: number,
): void {
  // Convert expansion state to collapsed paths set (for O(1) lookup)
  const collapsedPaths = new Set<string>();
  if (typeof expansionState === "boolean") {
    if (!expansionState) {
      collapsedPaths.add("*"); // Collapse all marker
    }
  } else {
    Object.entries(expansionState).forEach(([path, isExpanded]) => {
      if (!isExpanded) {
        collapsedPaths.add(path);
      }
    });
  }

  // Iterative traversal (stack-based DFS)
  const stack: TreeNode[] = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop()!;

    // Determine if this node should be expanded
    let shouldExpand = true;

    // Check expandDepth first (highest priority)
    if (expandDepth !== undefined) {
      shouldExpand = node.depth < expandDepth;
    }
    // Check "collapse all" marker
    else if (collapsedPaths.has("*")) {
      shouldExpand = false;
    }
    // Check if boolean expansion state
    else if (typeof expansionState === "boolean") {
      shouldExpand = expansionState;
    }
    // Check if explicitly collapsed
    else if (collapsedPaths.has(node.id)) {
      shouldExpand = false;
    }

    // Apply expansion state
    node.isExpanded = shouldExpand && node.isExpandable;
    node.userExpand = node.isExpandable
      ? typeof expansionState === "boolean"
        ? undefined
        : expansionState[node.id]
      : undefined;

    // Push children to stack
    node.children.forEach((child) => stack.push(child));
  }
}

/**
 * Compute childOffsets and visibleDescendantCount (PASS 3: Navigation)
 *
 * Uses iterative post-order traversal to compute offsets bottom-up.
 * childOffsets are cumulative counts for binary search.
 *
 * Example: If node has 3 children with 10, 5, 8 visible descendants:
 *   childOffsets = [1, 11, 16, 24]
 *   (1 for first child, 1+10 for second, 1+10+5 for third, 1+10+5+8 total)
 *
 * @param rootNode - The root of the tree
 */
function computeOffsetsIterative(rootNode: TreeNode): void {
  // Post-order traversal (process children before parent)
  // We'll use two passes: first collect nodes in post-order, then process

  const postOrder: TreeNode[] = [];
  const stack: { node: TreeNode; visited: boolean }[] = [
    { node: rootNode, visited: false },
  ];

  // Collect nodes in post-order
  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.visited) {
      // Already processed children, add to post-order list
      postOrder.push(current.node);
    } else {
      // Mark as visited and push back
      stack.push({ node: current.node, visited: true });

      // Push children (reverse order for correct post-order)
      for (let i = current.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: current.node.children[i]!, visited: false });
      }
    }
  }

  // Process nodes in post-order (children before parents)
  postOrder.forEach((node) => {
    if (!node.isExpandable || !node.isExpanded) {
      // Collapsed or primitive: no visible descendants
      node.visibleDescendantCount = 0;
      node.childOffsets = [];
      return;
    }

    // Expanded: compute childOffsets and total visible descendants
    const offsets: number[] = [];
    let cumulative = 0;

    node.children.forEach((child) => {
      // Add child + its descendants, then push cumulative offset
      cumulative += 1 + child.visibleDescendantCount;
      offsets.push(cumulative);
    });

    node.childOffsets = offsets;
    node.visibleDescendantCount = cumulative;
  });
}

/**
 * Calculate tree dimensions (PASS 4: Width calculation)
 *
 * Iterates through all nodes to find:
 * - Maximum depth across entire tree
 * - Maximum content width needed for any row (FULL untruncated width)
 *
 * This ensures width is stable regardless of expansion state.
 * This is DATA LAYER - always uses full string lengths.
 *
 * @param allNodes - All nodes in pre-order (from PASS 1.5)
 * @param config - Width estimation configuration
 * @returns Dimensions metadata
 */
function calculateTreeDimensions(
  allNodes: TreeNode[],
  config: WidthEstimatorConfig,
): { maxDepth: number; maxContentWidth: number } {
  let maxDepth = 0;
  let maxContentWidth = 0;

  for (const node of allNodes) {
    // Track maximum depth
    if (node.depth > maxDepth) {
      maxDepth = node.depth;
    }

    // Calculate width for this node (full untruncated)
    const nodeWidth = calculateNodeWidth(node, config);
    if (nodeWidth > maxContentWidth) {
      maxContentWidth = nodeWidth;
    }
  }

  return { maxDepth, maxContentWidth };
}

/**
 * Build complete tree from JSON data
 *
 * Four-pass build:
 * 1. Build structure (nodes, children, hierarchy)
 * 2. Apply expansion state (isExpanded, userExpand)
 * 3. Compute offsets (childOffsets, visibleDescendantCount)
 * 4. Calculate dimensions (maxDepth, maxContentWidth)
 *
 * All passes use ITERATIVE traversal (no recursion).
 *
 * @param data - The JSON data
 * @param config - Configuration
 * @returns Complete tree state
 */
export function buildTreeFromJSON(
  data: unknown,
  config: {
    rootKey: string;
    initialExpansion: ExpansionState;
    expandDepth?: number;
    widthEstimator?: WidthEstimatorConfig;
  },
): TreeState {
  debugLog("[buildTreeFromJSON] Starting four-pass build");
  const totalStartTime = performance.now();

  // PASS 1: Build structure
  const { rootNode, nodeMap } = buildTreeStructureIterative(
    data,
    config.rootKey,
  );

  // PASS 1.5: Assign line numbers and rebuild allNodes in pre-order
  // (must happen after structure is complete)
  const allNodes = assignLineNumbersAndBuildAllNodes(rootNode);

  // PASS 2: Apply expansion state
  applyExpansionStateIterative(
    rootNode,
    config.initialExpansion,
    config.expandDepth,
  );

  // PASS 3: Compute offsets
  computeOffsetsIterative(rootNode);

  // PASS 4: Calculate dimensions (maxDepth, maxContentWidth)
  // Always uses FULL untruncated widths (data layer)
  // Use default config if not provided
  const widthConfig: WidthEstimatorConfig = config.widthEstimator ?? {
    charWidthPx: 6.2,
    indentSizePx: 16,
    extraBufferPx: 50,
  };
  const { maxDepth, maxContentWidth } = calculateTreeDimensions(
    allNodes,
    widthConfig,
  );

  const totalTime = performance.now() - totalStartTime;
  debugLog("[buildTreeFromJSON] Completed four-pass build:", {
    totalTime: `${totalTime.toFixed(2)}ms`,
    totalNodes: allNodes.length,
    maxDepth,
    maxContentWidth: `${maxContentWidth.toFixed(0)}px`,
  });

  return {
    rootNode,
    nodeMap,
    allNodes,
    totalNodeCount: allNodes.length,
    maxDepth,
    maxContentWidth,
  };
}

/**
 * Estimate total node count without building tree
 * Used to determine if we should use Web Worker
 *
 * @param data - The JSON data
 * @returns Estimated node count
 */
export function estimateNodeCount(data: unknown): number {
  let count = 0;

  // Iterative traversal (stack-based)
  const stack: unknown[] = [data];

  while (stack.length > 0) {
    const current = stack.pop()!;
    count++;

    if (isExpandable(current)) {
      const children = getChildren(current);
      children.forEach(([_, childValue]) => {
        stack.push(childValue);
      });
    }
  }

  return count;
}

/**
 * Check if tree building should use Web Worker
 *
 * @param data - The JSON data
 * @returns True if Web Worker should be used
 */
export function shouldUseWorkerForTreeBuild(data: unknown): boolean {
  const estimatedCount = estimateNodeCount(data);
  return estimatedCount > TREE_BUILD_THRESHOLD;
}
