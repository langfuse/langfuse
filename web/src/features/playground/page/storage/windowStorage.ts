import { type PlaygroundCache } from "../types";
import {
  getCacheKey,
  getModelNameKey,
  getModelProviderKey,
  WINDOW_IDS_KEY,
} from "./keys";

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

export const saveWindowIds = (ids: string[]): void => {
  sessionStorage.setItem(WINDOW_IDS_KEY, JSON.stringify(ids));
};

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

export const setWindowState = (
  windowId: string,
  cache: PlaygroundCache,
): void => {
  const key = getCacheKey(windowId);
  if (cache === null) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, JSON.stringify(cache));
};

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

export const removeWindowState = (windowId: string): void => {
  sessionStorage.removeItem(getCacheKey(windowId));
  sessionStorage.removeItem(getModelNameKey(windowId));
  sessionStorage.removeItem(getModelProviderKey(windowId));
};

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
