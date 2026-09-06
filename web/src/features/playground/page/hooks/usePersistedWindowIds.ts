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
import { useTranslations } from "next-intl";

/**
 * Hook to persist window IDs across page refreshes.
 * Manages the list of active playground windows by orchestrating with storage utilities.
 */
export function usePersistedWindowIds() {
  const t = useTranslations("playgroundDashboard.playground.page");
  const [windowIds, setWindowIds] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load window IDs from storage on initial mount
  useEffect(() => {
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
          t("maximumWindows", { count: MULTI_WINDOW_CONFIG.MAX_WINDOWS }),
        );
        return null;
      }
      setWindowIds((prev) => [...prev, windowId]);
      return windowId;
    },
    [t, windowIds],
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
          t("maximumWindows", { count: MULTI_WINDOW_CONFIG.MAX_WINDOWS }),
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
    [t, windowIds],
  );

  /**
   * Removes a window and its associated storage.
   * @param windowId - The ID of the window to remove.
   */
  const removeWindowId = useCallback(
    (windowId: string) => {
      if (windowIds.length <= 1) {
        toast.error(t("cannotRemoveLastWindow"));
        return;
      }

      removeWindowState(windowId);
      setWindowIds((prev) => prev.filter((id) => id !== windowId));
    },
    [t, windowIds.length],
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
