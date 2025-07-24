import { type PlaygroundCache } from "../types";
import {
  getCacheKey,
  getModelNameKey,
  getModelProviderKey,
  WINDOW_IDS_KEY,
} from "./keys";

/**
 * Retrieves the list of window IDs from sessionStorage.
 * @returns An array of window IDs.
 */
export const getWindowIds = (): string[] | null => {
  const saved = sessionStorage.getItem(WINDOW_IDS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.error("Failed to parse saved window IDs, clearing.", e);
      sessionStorage.removeItem(WINDOW_IDS_KEY);
    }
  }
  return null;
};

/**
 * Saves the list of window IDs to sessionStorage.
 * @param ids - The array of window IDs to save.
 */
export const saveWindowIds = (ids: string[]): void => {
  sessionStorage.setItem(WINDOW_IDS_KEY, JSON.stringify(ids));
};

/**
 * Retrieves the cached state for a specific window.
 * @param windowId - The ID of the window.
 * @returns The cached state or null if not found.
 */
export const getWindowState = (windowId: string): PlaygroundCache | null => {
  const key = getCacheKey(windowId);
  const cachedState = sessionStorage.getItem(key);
  if (!cachedState) return null;
  try {
    return JSON.parse(cachedState) as PlaygroundCache;
  } catch (error) {
    console.error(`Failed to parse cache for window ${windowId}:`, error);
    sessionStorage.removeItem(key);
    return null;
  }
};

/**
 * Clones the entire state (cache and model params) from a source window to a target window.
 * @param sourceWindowId - The ID of the window to copy from.
 * @param targetWindowId - The ID of the window to copy to.
 */
export const cloneWindowState = (
  sourceWindowId: string,
  targetWindowId: string,
): void => {
  try {
    // 1. Clone sessionStorage (cache)
    const sourceState = getWindowState(sourceWindowId);
    if (sourceState) {
      const clonedState = JSON.parse(JSON.stringify(sourceState));
      sessionStorage.setItem(
        getCacheKey(targetWindowId),
        JSON.stringify(clonedState),
      );
    }

    const sourceModelName = sessionStorage.getItem(
      getModelNameKey(sourceWindowId),
    );
    if (sourceModelName) {
      sessionStorage.setItem(getModelNameKey(targetWindowId), sourceModelName);
    }
    const sourceModelProvider = sessionStorage.getItem(
      getModelProviderKey(sourceWindowId),
    );
    if (sourceModelProvider) {
      sessionStorage.setItem(
        getModelProviderKey(targetWindowId),
        sourceModelProvider,
      );
    }
  } catch (error) {
    console.error(
      `Failed to clone window state from ${sourceWindowId} to ${targetWindowId}`,
      error,
    );
  }
};

/**
 * Removes all storage associated with a single window.
 * @param windowId - The ID of the window to remove.
 */
export const removeWindowState = (windowId: string): void => {
  sessionStorage.removeItem(getCacheKey(windowId));
  sessionStorage.removeItem(getModelNameKey(windowId));
  sessionStorage.removeItem(getModelProviderKey(windowId));
};

/**
 * Clears all playground-related data from storage.
 */
export const clearAllPlaygroundData = (): void => {
  const sessionKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("playground")) {
      sessionKeysToRemove.push(key);
    }
  }
  sessionKeysToRemove.forEach((key) => sessionStorage.removeItem(key));

  const localKeysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith("llmModel")) {
      localKeysToRemove.push(key);
    }
  }
  localKeysToRemove.forEach((key) => sessionStorage.removeItem(key));
};
