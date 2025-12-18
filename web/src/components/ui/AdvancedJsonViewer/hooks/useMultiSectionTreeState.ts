import { useState, useMemo, useCallback, useEffect } from "react";
import {
  buildMultiSectionTree,
  updateSpacerHeights,
  type SectionConfig,
} from "../utils/multiSectionTree";
import { toggleNodeExpansion } from "../utils/treeExpansion";
import { searchInTree } from "../utils/searchJson";

export interface UseMultiSectionTreeStateProps {
  /** Data configurations (no presentation logic) */
  sectionConfigs: SectionConfig[];
  searchQuery?: string;
}

/**
 * Hook for managing multi-section tree state
 *
 * Manages pure data structure (TreeState) separated from presentation.
 * The tree contains no React elements - only structural/semantic data.
 *
 * Features:
 * - Builds tree on mount (memoized)
 * - Tracks expansion version for re-renders
 * - Handles node toggle (JSON nodes)
 * - Handles section toggle (section headers)
 * - Auto-expands sections with search matches
 */
export function useMultiSectionTreeState({
  sectionConfigs,
  searchQuery,
}: UseMultiSectionTreeStateProps) {
  // Build tree from data configs (memoized, pure data structure)
  const initialTree = useMemo(() => {
    return buildMultiSectionTree(sectionConfigs);
  }, [sectionConfigs]);

  // Track expansion version (triggers re-render after toggle)
  // Tree is mutated in place (JIT approach), so we need version for React
  const [expansionVersion, setExpansionVersion] = useState(0);

  // Tree reference (mutated in place)
  const tree = initialTree;

  // Toggle expansion of any node (JSON nodes within sections)
  const handleToggleExpansion = useCallback(
    (nodeId: string) => {
      toggleNodeExpansion(tree, nodeId);
      updateSpacerHeights(tree, 14); // Update spacer heights after toggle
      setExpansionVersion((v) => v + 1);
    },
    [tree],
  );

  // Toggle section expansion (section headers)
  const handleToggleSectionExpansion = useCallback(
    (sectionKey: string) => {
      const headerNodeId = `${sectionKey}__header`;
      toggleNodeExpansion(tree, headerNodeId);
      updateSpacerHeights(tree, 14); // Update spacer heights after toggle
      setExpansionVersion((v) => v + 1);
    },
    [tree],
  );

  // Auto-expand sections with search matches
  useEffect(() => {
    if (!searchQuery || searchQuery.trim() === "") return;

    const matches = searchInTree(tree, searchQuery);
    const sectionsWithMatches = new Set<string>();

    matches.forEach((match) => {
      const node = tree.nodeMap.get(match.rowId);
      if (node?.sectionKey) {
        sectionsWithMatches.add(node.sectionKey);
      }
    });

    // Expand sections that have matches but are collapsed
    let needsUpdate = false;
    sectionsWithMatches.forEach((sectionKey) => {
      const headerNode = tree.nodeMap.get(`${sectionKey}__header`);
      if (headerNode && !headerNode.isExpanded) {
        toggleNodeExpansion(tree, headerNode.id);
        needsUpdate = true;
      }
    });

    if (needsUpdate) {
      updateSpacerHeights(tree, 14); // Update spacer heights after auto-expand
      setExpansionVersion((v) => v + 1);
    }
  }, [tree, searchQuery]);

  return {
    tree,
    expansionVersion,
    handleToggleExpansion,
    handleToggleSectionExpansion,
  };
}
