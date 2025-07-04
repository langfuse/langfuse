import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MULTI_WINDOW_CONFIG, type PlaygroundCache } from "../types";

/**
 * Hook to persist window IDs across page refreshes
 * Manages the list of active playground windows in sessionStorage
 *
 * Features:
 * - Maintains window IDs in sessionStorage for persistence
 * - Handles window addition/removal with proper validation
 * - Supports adding windows with specific IDs for external integrations
 * - Cleans up associated caches and model parameters when windows are removed
 * - Provides state extraction and copying functionality for window duplication
 *
 * @returns Object with window IDs state and management functions
 */
export function usePersistedWindowIds() {
  const [windowIds, setWindowIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load window IDs from sessionStorage on mount
  useEffect(() => {
    const savedWindowIds = sessionStorage.getItem("playgroundWindowIds");
    if (savedWindowIds) {
      try {
        const parsed = JSON.parse(savedWindowIds);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWindowIds(parsed);
          setIsLoaded(true);
          return;
        }
      } catch (e) {
        console.error("Failed to parse saved window IDs:", e);
        sessionStorage.removeItem("playgroundWindowIds");
      }
    }

    // Default to one window with UUID if no saved IDs exist
    setWindowIds([uuidv4()]);

    setIsLoaded(true);
  }, []);

  // Save window IDs to sessionStorage whenever they change
  useEffect(() => {
    if (isLoaded && windowIds.length > 0) {
      sessionStorage.setItem("playgroundWindowIds", JSON.stringify(windowIds));
    }
  }, [windowIds, isLoaded]);

  /**
   * Extract playground state from a specific window's cache
   * Reads the window-specific cache from sessionStorage and model parameters from localStorage
   *
   * @param windowId - The window ID to extract state from
   * @returns PlaygroundCache object with the window's current state, or null if not found
   */
  const extractWindowState = useCallback(
    (windowId: string): PlaygroundCache => {
      try {
        // Generate the cache key for the source window
        const effectiveWindowId =
          windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
        const cacheKey =
          effectiveWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "playgroundCache"
            : `playgroundCache_${effectiveWindowId}`;

        // Get the cached state from sessionStorage
        const cachedState = sessionStorage.getItem(cacheKey);
        if (!cachedState) {
          return null;
        }

        return JSON.parse(cachedState) as PlaygroundCache;
      } catch (error) {
        console.error(
          `Failed to extract state from window ${windowId}:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  /**
   * Clone playground state to a new window
   * Deep clones the state and applies it to the target window's cache
   *
   * @param sourceWindowId - The window ID to copy state from
   * @param targetWindowId - The window ID to copy state to
   * @returns boolean indicating success of the cloning operation
   */
  const cloneWindowState = useCallback(
    (sourceWindowId: string, targetWindowId: string): boolean => {
      try {
        // Extract the source window's state
        const sourceState = extractWindowState(sourceWindowId);
        if (!sourceState) {
          console.warn(`No state found for source window ${sourceWindowId}`);
          return false;
        }

        // Deep clone the state to avoid reference sharing
        const clonedState: PlaygroundCache = JSON.parse(
          JSON.stringify(sourceState),
        );

        // Apply the cloned state to the target window
        const effectiveTargetWindowId =
          targetWindowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
        const targetCacheKey =
          effectiveTargetWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "playgroundCache"
            : `playgroundCache_${effectiveTargetWindowId}`;

        // Store the cloned cache in sessionStorage
        if (clonedState) {
          sessionStorage.setItem(targetCacheKey, JSON.stringify(clonedState));
        }

        // Also clone model parameters from source localStorage to target localStorage
        const sourceEffectiveWindowId =
          sourceWindowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
        const sourceModelNameKey =
          sourceEffectiveWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "llmModelName"
            : `llmModelName_${sourceEffectiveWindowId}`;
        const sourceModelProviderKey =
          sourceEffectiveWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "llmModelProvider"
            : `llmModelProvider_${sourceEffectiveWindowId}`;

        const targetModelNameKey =
          effectiveTargetWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "llmModelName"
            : `llmModelName_${effectiveTargetWindowId}`;
        const targetModelProviderKey =
          effectiveTargetWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
            ? "llmModelProvider"
            : `llmModelProvider_${effectiveTargetWindowId}`;

        // Copy model parameters from source to target localStorage
        const sourceModelName = localStorage.getItem(sourceModelNameKey);
        const sourceModelProvider = localStorage.getItem(
          sourceModelProviderKey,
        );

        if (sourceModelName) {
          localStorage.setItem(targetModelNameKey, sourceModelName);
        }
        if (sourceModelProvider) {
          localStorage.setItem(targetModelProviderKey, sourceModelProvider);
        }

        return true;
      } catch (error) {
        console.error(
          `Failed to clone state from ${sourceWindowId} to ${targetWindowId}:`,
          error,
        );
        return false;
      }
    },
    [extractWindowState],
  );

  /**
   * Get the most recently created window ID
   * Uses the window order to determine the most recent window
   *
   * @returns The most recently created window ID, or null if no windows exist
   */
  const getMostRecentWindowId = useCallback((): string | null => {
    if (windowIds.length === 0) {
      return null;
    }
    // The most recently created window is the last one in the array
    return windowIds[windowIds.length - 1];
  }, [windowIds]);

  /**
   * Add a new window ID to the list
   * Respects the maximum window limit
   * Always generates a new UUID for additional windows
   */
  const addWindowId = useCallback(() => {
    setWindowIds((prev) => {
      if (prev.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        console.warn(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return prev;
      }
      return [...prev, uuidv4()];
    });
  }, []);

  /**
   * Add a window with a specific ID to the list
   * Respects the maximum window limit
   * Returns the window ID if successful, or null if failed
   * If the window ID already exists, returns the existing ID
   */
  const addWindowWithId = useCallback((windowId: string) => {
    let resultWindowId: string | null = null;
    setWindowIds((prev) => {
      // Check if the window ID already exists
      if (prev.includes(windowId)) {
        resultWindowId = windowId;
        return prev; // No change needed
      }

      // Check maximum window limit
      if (prev.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        console.warn(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return prev;
      }

      // Add the new window ID
      resultWindowId = windowId;
      return [...prev, windowId];
    });
    return resultWindowId;
  }, []);

  /**
   * Add a new window with state copied from a source window
   * Combines window creation with state copying for convenience
   *
   * @param sourceWindowId - Optional source window ID to copy state from. If not provided, copies from most recent window
   * @returns The new window ID if successful, or null if failed
   */
  const addWindowWithCopy = useCallback(
    (sourceWindowId?: string) => {
      if (windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        console.warn(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return null;
      }

      // Generate a new window ID
      const newWindowId = crypto.randomUUID();

      // Determine the source window to copy from
      let effectiveSourceWindowId = sourceWindowId;
      if (!effectiveSourceWindowId && windowIds.length > 0) {
        // If no source window specified, copy from the most recently created window
        effectiveSourceWindowId = getMostRecentWindowId() ?? undefined;
      }

      // If a source window is available, copy its state to the new window
      if (effectiveSourceWindowId) {
        const copySuccess = cloneWindowState(
          effectiveSourceWindowId,
          newWindowId,
        );
        if (copySuccess) {
          console.log(
            `Copied state from window ${effectiveSourceWindowId} to ${newWindowId}`,
          );
        } else {
          console.warn(
            `Failed to copy state from window ${effectiveSourceWindowId}`,
          );
        }
      }

      // Add the new window ID to the persisted list
      const resultWindowId = addWindowWithId(newWindowId);
      return resultWindowId;
    },
    [windowIds, getMostRecentWindowId, cloneWindowState, addWindowWithId],
  );

  /**
   * Remove a window ID from the list
   * Also cleans up the associated cache entry and model parameters
   * Prevents removal of the last remaining window
   */
  const removeWindowId = useCallback((windowId: string) => {
    setWindowIds((prev) => {
      if (prev.length <= 1) {
        console.warn("Cannot remove the last remaining window");
        return prev;
      }

      // Clean up the window's cache when removing
      const effectiveWindowId =
        windowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
          ? "playgroundCache"
          : `playgroundCache_${windowId}`;
      sessionStorage.removeItem(effectiveWindowId);

      // Clean up model parameters for this window
      if (windowId !== MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID) {
        localStorage.removeItem(`llmModelName_${windowId}`);
        localStorage.removeItem(`llmModelProvider_${windowId}`);
      }

      return prev.filter((id) => id !== windowId);
    });
  }, []);

  /**
   * Clear all playground caches and reset window IDs
   * Removes all cached data and model parameters, then resets to a single default window
   * Scans sessionStorage and localStorage directly to ensure all entries are found
   */
  const clearAllCaches = useCallback(() => {
    // Find all playground cache keys in sessionStorage
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (
        key &&
        (key.startsWith("playgroundCache") || key === "playgroundWindowIds")
      ) {
        sessionKeysToRemove.push(key);
      }
    }

    // Remove all playground cache entries
    sessionKeysToRemove.forEach((key) => {
      sessionStorage.removeItem(key);
    });

    // Find all model parameter keys in localStorage
    const localKeysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.startsWith("llmModelName") || key.startsWith("llmModelProvider"))
      ) {
        localKeysToRemove.push(key);
      }
    }

    // Remove all model parameter entries
    localKeysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });

    // Reset to single default window
    setWindowIds([uuidv4()]);
  }, []);

  return {
    windowIds,
    isLoaded,
    addWindowId,
    addWindowWithId,
    addWindowWithCopy,
    removeWindowId,
    clearAllCaches,
    extractWindowState,
    cloneWindowState,
    getMostRecentWindowId,
  };
}
