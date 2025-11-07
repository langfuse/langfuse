import { useCallback, useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { MULTI_WINDOW_CONFIG } from "../types";
import {
  getWindowIds,
  saveWindowIds,
  cloneWindowState,
  removeWindowState,
  clearAllPlaygroundData,
} from "../storage/windowStorage";
import { toast } from "sonner";

/**
 * Hook to persist window IDs across page refreshes.
 * Manages the list of active playground windows by orchestrating with storage utilities.
 */
export function usePersistedWindowIds() {
  const [windowIds, setWindowIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load window IDs from storage on initial mount
  useEffect(() => {
    // Check for temporary cache from "Fresh playground" button (opened in new tab)
    // This cache is stored in localStorage because sessionStorage doesn't transfer to new tabs
    const tempCacheKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("playground-temp-cache-")) {
        tempCacheKeys.push(key);
      }
    }

    // If we found temporary cache, this is a fresh playground opened in a new tab
    if (tempCacheKeys.length > 0) {
      // Clear all existing playground data first
      clearAllPlaygroundData();

      // Migrate the first temporary cache to sessionStorage
      // (there should typically only be one, but we process the first if multiple exist)
      const tempKey = tempCacheKeys[0];
      try {
        const tempCacheData = localStorage.getItem(tempKey);
        if (tempCacheData) {
          // Extract the window ID from the temp key
          const windowId = tempKey.replace("playground-temp-cache-", "");
          const cacheKey = `langfuse-playgroundCache_${windowId}`;
          
          // Move cache from localStorage to sessionStorage
          sessionStorage.setItem(cacheKey, tempCacheData);
          console.log(`Migrated temporary cache from ${tempKey} to ${cacheKey}`);
          
          // Set this as the only window ID for fresh playground
          setWindowIds([windowId]);
          setIsLoaded(true);
        }
      } catch (error) {
        console.error(`Failed to migrate temporary cache from ${tempKey}:`, error);
      } finally {
        // Clean up all temporary cache keys from localStorage
        tempCacheKeys.forEach((key) => {
          try {
            localStorage.removeItem(key);
          } catch (error) {
            console.error(`Failed to remove temporary cache ${key}:`, error);
          }
        });
      }
      return;
    }

    // Normal initialization if no temporary cache found
    const savedWindowIds = getWindowIds();
    setWindowIds(savedWindowIds ?? [uuidv4()]);
    setIsLoaded(true);
  }, []);

  // Save window IDs to storage whenever they change
  useEffect(() => {
    if (isLoaded) {
      saveWindowIds(windowIds);
    }
  }, [windowIds, isLoaded]);

  /**
   * Adds a window with a specific ID, if it doesn't already exist.
   * @param windowId - The ID of the window to add.
   * @returns The windowId if it was successfully added or already existed, otherwise null.
   */
  const addWindowWithId = useCallback(
    (windowId: string) => {
      if (windowIds.includes(windowId)) {
        return windowId;
      }
      if (windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        toast.error(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return null;
      }
      setWindowIds((prev) => [...prev, windowId]);
      return windowId;
    },
    [windowIds],
  );

  /**
   * Adds a new window, copying the state from a source window.
   * @param sourceWindowId - Optional ID of the window to copy. Defaults to the most recent window.
   * @returns The ID of the newly created window, or null if the window limit is reached.
   */
  const addWindowWithCopy = useCallback(
    (sourceWindowId?: string) => {
      if (windowIds.length >= MULTI_WINDOW_CONFIG.MAX_WINDOWS) {
        toast.error(
          `Maximum window limit of ${MULTI_WINDOW_CONFIG.MAX_WINDOWS} reached`,
        );
        return null;
      }

      const newWindowId = uuidv4();
      const sourceId = sourceWindowId ?? windowIds[windowIds.length - 1];

      if (sourceId) {
        cloneWindowState(sourceId, newWindowId);
      }

      setWindowIds((prev) => [...prev, newWindowId]);
      return newWindowId;
    },
    [windowIds],
  );

  /**
   * Removes a window and its associated storage.
   * @param windowId - The ID of the window to remove.
   */
  const removeWindowId = useCallback(
    (windowId: string) => {
      if (windowIds.length <= 1) {
        toast.error("Cannot remove the last remaining window");
        return;
      }

      removeWindowState(windowId);
      setWindowIds((prev) => prev.filter((id) => id !== windowId));
    },
    [windowIds.length],
  );

  /**
   * Clears all playground data from storage and resets to a single window.
   */
  const clearAllCache = useCallback((windowId?: string) => {
    clearAllPlaygroundData();
    setWindowIds([windowId ?? uuidv4()]);
  }, []);

  return {
    windowIds,
    isLoaded,
    addWindowWithId,
    addWindowWithCopy,
    removeWindowId,
    clearAllCache,
  };
}
