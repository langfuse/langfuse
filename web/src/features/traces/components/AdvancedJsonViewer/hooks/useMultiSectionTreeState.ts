import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  buildMultiSectionTree,
  updateSpacerHeights,
  type SectionConfig,
} from "../utils/multiSectionTree";
import {
  toggleNodeExpansion,
  exportExpansionState,
  applyExpansionState,
} from "../utils/treeExpansion";
import { searchInTree } from "../utils/searchJson";
import { useMonospaceCharWidth } from "./useMonospaceCharWidth";
import type { ExpansionState } from "../types";

export interface UseMultiSectionTreeStateProps {
  /** Data configurations (no presentation logic) */
  sectionConfigs: SectionConfig[];
  searchQuery?: string;
  /** Indent size in pixels (default: 12) */
  indentSizePx?: number;
  /** External expansion state (full paths like "input.messages.0") */
  externalExpansionState?: ExpansionState;
  /** Callback when expansion state changes (emits Record from exportExpansionState) */
  onExpansionChange?: (state: Record<string, boolean>) => void;
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
  indentSizePx = 12,
  externalExpansionState,
  onExpansionChange,
}: UseMultiSectionTreeStateProps) {
  // Measure actual monospace character width for accurate width estimation
  const charWidth = useMonospaceCharWidth();

  // Build tree from data configs (memoized, pure data structure)
  const initialTree = useMemo(() => {
    const tree = buildMultiSectionTree(sectionConfigs, {
      widthConfig: {
        charWidthPx: charWidth,
        indentSizePx,
        extraBufferPx: 50,
      },
    });

    return tree;
  }, [sectionConfigs, charWidth, indentSizePx]);

  // Track expansion version (triggers re-render after toggle)
  // Tree is mutated in place (JIT approach), so we need version for React
  const [expansionVersion, setExpansionVersion] = useState(0);

  // Tree reference (mutated in place)
  const tree = initialTree;

  // Apply external expansion state when it changes OR when tree rebuilds.
  //
  // Why refs initialized with null (not current values):
  // - If initialized with current values, first render would see no changes
  //   (prevTreeRef.current === tree), so saved state would never be applied
  // - With null, first render always triggers: null !== tree → apply saved state
  //
  // Why track both state AND tree:
  // - stateChanged: User toggled nodes → state updated in context
  // - treeChanged: Navigated to different observation → tree rebuilt from new data
  // - Must apply saved state in both cases
  const prevExternalStateRef = useRef<ExpansionState | null>(null);
  const prevTreeRef = useRef<typeof tree | null>(null);
  useEffect(() => {
    const stateChanged =
      prevExternalStateRef.current !== externalExpansionState;
    const treeChanged = prevTreeRef.current !== tree;

    if (externalExpansionState && (stateChanged || treeChanged)) {
      prevExternalStateRef.current = externalExpansionState;
      prevTreeRef.current = tree;
      applyExpansionState(tree, externalExpansionState);
      updateSpacerHeights(tree, 14);
      setExpansionVersion((v) => v + 1);
    }
  }, [externalExpansionState, tree]);

  // Toggle expansion of any node (JSON nodes within sections)
  const handleToggleExpansion = useCallback(
    (nodeId: string) => {
      toggleNodeExpansion(tree, nodeId);
      updateSpacerHeights(tree, 14); // Update spacer heights after toggle
      setExpansionVersion((v) => v + 1);

      // Export expansion state for persistence
      if (onExpansionChange) {
        const newState = exportExpansionState(tree);
        onExpansionChange(newState);
      }
    },
    [tree, onExpansionChange],
  );

  // Toggle section expansion (section headers)
  const handleToggleSectionExpansion = useCallback(
    (sectionKey: string) => {
      const headerNodeId = `${sectionKey}__header`;
      toggleNodeExpansion(tree, headerNodeId);
      updateSpacerHeights(tree, 14); // Update spacer heights after toggle
      setExpansionVersion((v) => v + 1);

      // Export expansion state for persistence
      if (onExpansionChange) {
        const newState = exportExpansionState(tree);
        onExpansionChange(newState);
      }
    },
    [tree, onExpansionChange],
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
