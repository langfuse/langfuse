/**
 * React hook for tree state management
 *
 * Manages tree building, expansion state, and synchronization with context.
 * Implements the 10K threshold for sync vs Web Worker build.
 *
 * Key features:
 * - Tree is source of truth after initialization
 * - Uses expansionVersion counter to trigger virtualizer updates
 * - Syncs expansion state back to context without causing re-renders
 * - Handles both small (sync) and large (worker) datasets
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExpansionState } from "../types";
import type { TreeState } from "../utils/treeStructure";
import {
  buildTreeFromJSON,
  estimateNodeCount,
  TREE_BUILD_THRESHOLD,
} from "../utils/treeStructure";
import {
  toggleNodeExpansion,
  exportExpansionState,
} from "../utils/treeExpansion";
import { debugLog, debugError } from "../utils/debug";
import {
  readFormattedExpansion,
  writeFormattedExpansion,
} from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useMonospaceCharWidth } from "./useMonospaceCharWidth";

/**
 * Configuration for tree building
 */
interface UseTreeStateConfig {
  rootKey?: string;
  expandDepth?: number;
  indentSizePx?: number; // Theme indent size for width calculation (data layer only)
}

/**
 * Return value from useTreeState
 */
interface UseTreeStateReturn {
  tree: TreeState | null;
  isBuilding: boolean;
  isReady: boolean;
  buildTime: number | undefined;
  buildError: string | null;
  expansionVersion: number; // Counter that increments on every expansion change
  handleToggleExpansion: (nodeId: string) => void;
}

/**
 * Build tree in Web Worker (for large datasets)
 */
async function buildTreeInWorker(
  data: unknown,
  config: Parameters<typeof buildTreeFromJSON>[1],
  dataSize: number,
): Promise<{ tree: TreeState; buildTime: number }> {
  debugLog(
    `[buildTreeInWorker] Building tree with ${dataSize} nodes in Web Worker`,
  );

  return new Promise((resolve, reject) => {
    try {
      // Create Web Worker
      const worker = new Worker(
        new URL("../workers/tree-builder.worker.ts", import.meta.url),
        { type: "module" },
      );

      // Send build request
      worker.postMessage({
        type: "build",
        data,
        config,
      });

      // Handle response
      worker.onmessage = (event) => {
        if (event.data.type === "success") {
          debugLog(
            `[buildTreeInWorker] Worker completed in ${event.data.buildTime.toFixed(2)}ms`,
          );
          resolve({
            tree: event.data.tree,
            buildTime: event.data.buildTime,
          });
          worker.terminate();
        } else if (event.data.type === "error") {
          debugError("[buildTreeInWorker] Worker error:", event.data.error);
          reject(new Error(event.data.error));
          worker.terminate();
        }
      };

      // Handle worker errors
      worker.onerror = (error) => {
        debugError("[buildTreeInWorker] Worker error:", error);
        reject(error);
        worker.terminate();
      };
    } catch (error) {
      debugError(
        "[buildTreeInWorker] Failed to create worker, falling back to sync:",
        error,
      );
      // Fallback to sync build if worker creation fails
      const startTime = performance.now();
      const tree = buildTreeFromJSON(data, config);
      const buildTime = performance.now() - startTime;
      resolve({ tree, buildTime });
    }
  });
}

/**
 * Hook for managing tree state
 *
 * Handles tree building (sync or worker), expansion state, and storage sync.
 * Uses direct sessionStorage access to avoid context re-renders.
 *
 * @param data - JSON data to build tree from
 * @param field - Field name for storage key (e.g., "input", "output"). If null, no storage persistence.
 * @param initialExpansion - Initial expansion state (only used if field is null)
 * @param config - Tree building configuration
 * @returns Tree state and controls
 */
export function useTreeState(
  data: unknown,
  field: string | null,
  initialExpansion: ExpansionState = true,
  config: UseTreeStateConfig = {},
): UseTreeStateReturn {
  const { rootKey = "root", expandDepth, indentSizePx = 16 } = config;

  // Measure actual monospace character width for accurate width estimation
  const charWidth = useMonospaceCharWidth();

  // Estimate data size once
  const dataSize = useMemo(() => estimateNodeCount(data), [data]);

  // Track expansion version (increments on every toggle)
  const [expansionVersion, setExpansionVersion] = useState(0);

  // Read expansion state from storage (JIT - only when needed, no context subscription)
  const expansionFromStorage = useMemo(() => {
    if (!field) return initialExpansion;

    debugLog(
      `[useTreeState] Reading expansion state from storage for field: ${field}`,
    );
    return readFormattedExpansion(field);
  }, [field, initialExpansion]);

  // For small datasets, use direct useMemo (sync build)
  const syncTree = useMemo(() => {
    if (dataSize > TREE_BUILD_THRESHOLD) return null;

    debugLog(
      `[useTreeState] Small dataset (${dataSize} nodes), using sync build`,
    );
    const startTime = performance.now();
    const tree = buildTreeFromJSON(data, {
      rootKey,
      initialExpansion: expansionFromStorage,
      expandDepth,
      widthEstimator: {
        charWidthPx: charWidth,
        indentSizePx,
        extraBufferPx: 50,
      },
    });
    const buildTime = performance.now() - startTime;

    debugLog(
      `[useTreeState] Sync build completed in ${buildTime.toFixed(2)}ms`,
    );

    return { tree, buildTime };
  }, [
    data,
    dataSize,
    rootKey,
    expandDepth,
    expansionFromStorage,
    indentSizePx,
    charWidth,
  ]);

  // For large datasets, use React Query + Web Worker
  const asyncTreeQuery = useQuery({
    queryKey: [
      "tree-build",
      data,
      rootKey,
      expandDepth,
      expansionFromStorage,
      indentSizePx,
      charWidth,
    ],
    queryFn: () =>
      buildTreeInWorker(
        data,
        {
          rootKey,
          initialExpansion: expansionFromStorage,
          expandDepth,
          widthEstimator: {
            charWidthPx: charWidth,
            indentSizePx,
            extraBufferPx: 50,
          },
        },
        dataSize,
      ),
    enabled: dataSize > TREE_BUILD_THRESHOLD,
    staleTime: Infinity, // Tree build results don't go stale
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });

  // Determine which tree to use
  const treeResult = syncTree || asyncTreeQuery.data;
  const tree = treeResult?.tree ?? null;
  const buildTime = treeResult?.buildTime;
  const isBuilding =
    dataSize > TREE_BUILD_THRESHOLD ? asyncTreeQuery.isLoading : false;
  const isReady = tree !== null;
  const buildError =
    dataSize > TREE_BUILD_THRESHOLD && asyncTreeQuery.error
      ? String(asyncTreeQuery.error)
      : null;

  // Store tree in ref for mutation (expand/collapse)
  const treeRef = useRef<TreeState | null>(null);
  useEffect(() => {
    treeRef.current = tree;
  }, [tree]);

  // Debounced save to storage (no context, no re-renders)
  const saveExpansionToStorage = useDebounce(
    () => {
      if (!field || !treeRef.current) return;

      debugLog(
        `[useTreeState] Saving expansion state to storage for field: ${field}`,
      );
      const state = exportExpansionState(treeRef.current);
      writeFormattedExpansion(field, state);
    },
    1000, // 1 second debounce
    false, // Don't execute first call immediately
  );

  // Handle expansion toggle (JIT - fast O(log n) mutation, debounced storage write)
  const handleToggleExpansion = useCallback(
    (nodeId: string) => {
      if (!treeRef.current) return;

      debugLog("[useTreeState] Toggling expansion for node:", nodeId);
      const startTime = performance.now();

      // Toggle expansion (mutates tree in place - O(log n), ~0.1ms)
      toggleNodeExpansion(treeRef.current, nodeId);

      const toggleTime = performance.now() - startTime;
      debugLog(`[useTreeState] Toggle completed in ${toggleTime.toFixed(2)}ms`);

      // Increment expansion version to trigger React re-render (no tree rebuild)
      setExpansionVersion((v) => v + 1);

      // Debounced save to storage (after user stops clicking)
      saveExpansionToStorage();
    },
    [saveExpansionToStorage],
  );

  return {
    tree,
    isBuilding,
    isReady,
    buildTime,
    buildError,
    expansionVersion,
    handleToggleExpansion,
  };
}

/**
 * Hook for getting row data from tree (JIT rendering)
 *
 * This hook provides a getNodeByIndex function that can be memoized
 * and used with the virtualizer.
 *
 * @param tree - Tree state
 * @param expansionVersion - Expansion version counter (for cache invalidation)
 * @returns getNodeByIndex function
 */
export function useTreeRowGetter(
  tree: TreeState | null,
  expansionVersion: number,
) {
  const getNodeByIndex = useCallback(
    (index: number) => {
      if (!tree) return null;

      // Lazy import to avoid circular dependencies
      const { getNodeByIndex: getNode } = require("../utils/treeNavigation");
      return getNode(tree.rootNode, index);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tree, expansionVersion], // expansionVersion ensures cache invalidation on expand/collapse
  );

  const visibleRowCount = tree ? 1 + tree.rootNode.visibleDescendantCount : 0;

  return { getNodeByIndex, visibleRowCount };
}
