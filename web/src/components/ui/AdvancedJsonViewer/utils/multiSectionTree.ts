/**
 * Multi-Section Tree Building Utilities
 *
 * Builds a tree with multiple JSON roots, each with optional header/footer.
 * Maintains JIT O(log n) performance by treating sections as TreeNodes.
 *
 * Tree Structure:
 *   __meta_root__ (depth: -1, never rendered, always expanded)
 *   ├─ section1_header (depth: 0, nodeType: 'section-header')
 *   │  └─ section1_json_root (depth: 1, nodeType: 'json')
 *   ├─ section2_header (depth: 0, nodeType: 'section-header')
 *   │  ├─ section2_json_root (depth: 1, nodeType: 'json')
 *   │  └─ section2_footer (depth: 0, nodeType: 'section-footer')
 *   └─ ...
 */

import type { TreeNode, TreeState } from "./treeStructure";
import { buildTreeFromJSON } from "./treeStructure";
import { type WidthEstimatorConfig } from "./calculateWidth";

/**
 * Section configuration for tree building (data only, no presentation)
 */
export interface SectionConfig {
  /** Unique identifier (for expansion state) */
  key: string;
  /** JSON data to display */
  data: unknown;
  /** Section background color */
  backgroundColor?: string;
  /** Minimum height for section content (CSS value) */
  minHeight?: string;
  /** Whether this section has a footer (triggers footer node creation) */
  hasFooter?: boolean;
  /** Hide the data/key-value display, only show header/footer */
  hideData?: boolean;
}

/**
 * Get expansion state from sessionStorage
 */
function getStoredExpansion(key: string): boolean | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const stored = sessionStorage.getItem(`json-expansion:${key}`);
    if (stored === null) return undefined;
    return JSON.parse(stored) as boolean;
  } catch {
    return undefined;
  }
}

/**
 * Recompute childOffsets and visibleDescendantCount for a node
 */
function recomputeNodeOffsets(node: TreeNode): void {
  if (!node.isExpanded || node.children.length === 0) {
    node.childOffsets = [];
    node.visibleDescendantCount = 0;
    return;
  }

  const offsets: number[] = [];
  let cumulative = 0;

  node.children.forEach((child) => {
    cumulative += 1 + child.visibleDescendantCount;
    offsets.push(cumulative);
  });

  node.childOffsets = offsets;
  node.visibleDescendantCount = cumulative;
}

/**
 * Build multi-section tree with synthetic meta-root
 *
 * Each section becomes:
 * - section-header node (collapsible)
 * - JSON tree (children of header)
 * - section-footer node (optional, but not created here - headers/footers are rendered separately)
 *
 * @param sections - Array of section data configurations (no presentation logic)
 * @param config - Optional configuration
 * @returns TreeState with meta-root (pure data structure)
 */
export function buildMultiSectionTree(
  sections: SectionConfig[],
  config?: {
    initialExpansion?: boolean;
    widthConfig?: WidthEstimatorConfig;
  },
): TreeState {
  // 1. Create synthetic meta-root (never rendered)
  const metaRoot: TreeNode = {
    id: "__meta_root__",
    key: "__meta_root__",
    pathArray: ["__meta_root__"],
    value: null,
    type: "object",
    depth: -1, // Negative depth = not rendered
    parentNode: null,
    children: [],
    childCount: 0,
    isExpandable: false, // Can't collapse meta-root
    isExpanded: true, // Always expanded
    userExpand: undefined,
    childOffsets: [],
    visibleDescendantCount: 0,
    absoluteLineNumber: 0,
    indexInParent: 0,
    isLastChild: false,
    nodeType: "meta",
  };

  const allNodes: TreeNode[] = [metaRoot];
  const nodeMap = new Map<string, TreeNode>();
  nodeMap.set(metaRoot.id, metaRoot);

  let absoluteLineNumber = 1;
  let maxDepth = 0;
  let maxContentWidth = 0;

  // 2. Build each section
  sections.forEach((section) => {
    // 2a. Create section header node
    const headerNode: TreeNode = {
      id: `${section.key}__header`,
      key: `${section.key}__header`,
      pathArray: ["__meta_root__", `${section.key}__header`],
      value: null,
      type: "object",
      depth: 0,
      parentNode: metaRoot,
      children: [],
      childCount: 0,
      isExpandable: true, // Sections can collapse
      isExpanded: getStoredExpansion(`${section.key}__header`) ?? true,
      userExpand: undefined,
      childOffsets: [],
      visibleDescendantCount: 0,
      absoluteLineNumber: absoluteLineNumber++,
      indexInParent: metaRoot.children.length,
      isLastChild: false, // Will update later
      nodeType: "section-header",
      sectionKey: section.key,
      backgroundColor: section.backgroundColor,
      minHeight: section.minHeight,
      sectionLineNumber: undefined, // Headers don't have line numbers
    };

    allNodes.push(headerNode);
    nodeMap.set(headerNode.id, headerNode);
    metaRoot.children.push(headerNode);

    // 2b. Build JSON tree for this section (skip if hideData is true)
    if (!section.hideData) {
      const jsonTree = buildTreeFromJSON(section.data, {
        rootKey: section.key,
        initialExpansion: getStoredExpansion(section.key) ?? true,
        widthEstimator: config?.widthConfig,
      });

      // Track max content width from this section
      maxContentWidth = Math.max(maxContentWidth, jsonTree.maxContentWidth);

      // 2c. Re-parent JSON tree under header node and update properties
      let sectionLineNumber = 1;
      const stack: { node: TreeNode; newDepth: number }[] = [
        { node: jsonTree.rootNode, newDepth: 0 },
      ];

      while (stack.length > 0) {
        const { node, newDepth } = stack.pop()!;

        // Update node properties for multi-section
        node.depth = newDepth;
        node.sectionKey = section.key;
        node.backgroundColor = section.backgroundColor;
        node.minHeight = section.minHeight;
        node.nodeType = "json";

        // Set section line number (stable, assigned once during tree building)
        node.sectionLineNumber = sectionLineNumber++;

        // Update absolute line number
        node.absoluteLineNumber = absoluteLineNumber++;

        // Track max depth
        maxDepth = Math.max(maxDepth, node.depth);

        // Add to collections
        allNodes.push(node);
        nodeMap.set(node.id, node);

        // Process children in reverse order (for correct stack ordering)
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i]!, newDepth: newDepth + 1 });
        }
      }

      // Link JSON root to header
      jsonTree.rootNode.parentNode = headerNode;
      jsonTree.rootNode.indexInParent = 0;
      headerNode.children.push(jsonTree.rootNode);
      headerNode.childCount = 1;

      // Set total descendant count (for row count display, independent of expansion)
      headerNode.totalDescendantCount = jsonTree.totalNodeCount;
    } else {
      // No data to show, set counts to 0
      headerNode.totalDescendantCount = 0;
    }

    // 2c. Create spacer node if minHeight is set and content is shorter
    if (section.minHeight) {
      const minHeightPx = parseFloat(section.minHeight);
      const contentHeight = headerNode.visibleDescendantCount * 14; // lineHeight constant
      const spacerHeight = Math.max(0, minHeightPx - contentHeight);

      if (spacerHeight > 0) {
        const spacerNode: TreeNode = {
          id: `${section.key}__spacer`,
          key: `${section.key}__spacer`,
          pathArray: ["__meta_root__", `${section.key}__spacer`],
          value: null,
          type: "object",
          depth: 0,
          parentNode: headerNode,
          children: [],
          childCount: 0,
          isExpandable: false,
          isExpanded: true,
          userExpand: undefined,
          childOffsets: [],
          visibleDescendantCount: 0,
          absoluteLineNumber: absoluteLineNumber++,
          indexInParent: headerNode.children.length,
          isLastChild: false,
          nodeType: "section-spacer",
          sectionKey: section.key,
          backgroundColor: section.backgroundColor,
          spacerHeight: spacerHeight,
        };

        allNodes.push(spacerNode);
        nodeMap.set(spacerNode.id, spacerNode);
        headerNode.children.push(spacerNode);
        headerNode.childCount += 1;
      }
    }

    // 2d. Create footer node if section has a footer
    if (section.hasFooter) {
      const footerNode: TreeNode = {
        id: `${section.key}__footer`,
        key: `${section.key}__footer`,
        pathArray: ["__meta_root__", `${section.key}__footer`],
        value: null,
        type: "object",
        depth: 0,
        parentNode: headerNode,
        children: [],
        childCount: 0,
        isExpandable: false,
        isExpanded: true,
        userExpand: undefined,
        childOffsets: [],
        visibleDescendantCount: 0,
        absoluteLineNumber: absoluteLineNumber++,
        indexInParent: headerNode.children.length,
        isLastChild: false,
        nodeType: "section-footer",
        sectionKey: section.key,
        backgroundColor: section.backgroundColor,
        sectionLineNumber: undefined,
      };

      allNodes.push(footerNode);
      nodeMap.set(footerNode.id, footerNode);
      headerNode.children.push(footerNode);
      headerNode.childCount += 1;
    }

    // Recompute header offsets after adding JSON tree, spacer, and footer
    recomputeNodeOffsets(headerNode);
  });

  // 3. Update isLastChild flags
  metaRoot.children.forEach((child, index) => {
    child.isLastChild = index === metaRoot.children.length - 1;
  });

  // 4. Compute meta-root offsets
  metaRoot.childCount = metaRoot.children.length;
  recomputeNodeOffsets(metaRoot);

  return {
    rootNode: metaRoot,
    nodeMap,
    allNodes,
    totalNodeCount: allNodes.length,
    maxDepth,
    maxContentWidth,
  };
}

/**
 * Get section context data for a section key
 */
export function getSectionContext(
  tree: TreeState,
  sectionKey: string,
): { rowCount: number; isExpanded: boolean } {
  const headerNode = tree.nodeMap.get(`${sectionKey}__header`);

  if (!headerNode) {
    return { rowCount: 0, isExpanded: false };
  }

  // rowCount = number of visible JSON rows in section
  // = visibleDescendantCount of header node (excludes header itself)
  return {
    rowCount: headerNode.visibleDescendantCount,
    isExpanded: headerNode.isExpanded,
  };
}

/**
 * Get all section keys from tree
 */
export function getSectionKeys(tree: TreeState): string[] {
  return tree.rootNode.children
    .filter((child) => child.nodeType === "section-header")
    .map((child) => child.sectionKey!)
    .filter(Boolean);
}

/**
 * Update spacer heights after expansion changes
 * Call this after toggleNodeExpansion to recalculate spacer sizes
 */
export function updateSpacerHeights(tree: TreeState, lineHeight: number): void {
  tree.rootNode.children.forEach((headerNode) => {
    if (headerNode.nodeType !== "section-header" || !headerNode.minHeight) {
      return;
    }

    // Find spacer node (if it exists)
    const spacerNode = headerNode.children.find(
      (n) => n.nodeType === "section-spacer",
    );

    if (!spacerNode) return;

    // Recalculate spacer height based on current content
    const minHeightPx = parseFloat(headerNode.minHeight);
    const contentHeight = headerNode.visibleDescendantCount * lineHeight;
    spacerNode.spacerHeight = Math.max(0, minHeightPx - contentHeight);
  });
}
