import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MULTI_WINDOW_CONFIG } from "../types";

/**
 * Hook to persist window IDs across page refreshes
 * Manages the list of active playground windows in sessionStorage
 *
 * Features:
 * - Maintains window IDs in sessionStorage for persistence
 * - Handles window addition/removal with proper validation
 * - Supports adding windows with specific IDs for external integrations
 * - Cleans up associated caches and model parameters when windows are removed
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
    removeWindowId,
    clearAllCaches,
  };
}
