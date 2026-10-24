import { type PlaygroundCache } from "../types";
import {
  getCacheKey,
  getModelNameKey,
  getModelProviderKey,
  WINDOW_IDS_KEY,
} from "./keys";

/**
 * sessionStorage.setItem throws QuotaExceededError (and in Safari private
 * mode). Playground cache is a best-effort refresh persist, so a failed
 * write must not throw into React effects or user-click handlers.
 * console.warn, not console.error — error-level logs become Sentry events
 * via the console integration.
 */
export const safeSessionStorageSetItem = (
  key: string,
  value: string,
): boolean => {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn("Error writing to session storage", error);
    return false;
  }
};

export const getWindowIds = (): string[] | null => {
  const saved = sessionStorage.getItem(WINDOW_IDS_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch (e) {
      console.warn("Failed to parse saved window IDs, clearing.", e);
      sessionStorage.removeItem(WINDOW_IDS_KEY);
    }
  }
  return null;
};

export const saveWindowIds = (ids: string[]): void => {
  safeSessionStorageSetItem(WINDOW_IDS_KEY, JSON.stringify(ids));
};

export const getWindowState = (windowId: string): PlaygroundCache | null => {
  const key = getCacheKey(windowId);
  const cachedState = sessionStorage.getItem(key);
  if (!cachedState) return null;
  try {
    return JSON.parse(cachedState) as PlaygroundCache;
  } catch (error) {
    console.warn("Failed to parse playground window cache, clearing.", error);
    sessionStorage.removeItem(key);
    return null;
  }
};

export const setWindowState = (
  windowId: string,
  cache: PlaygroundCache,
): boolean => {
  const key = getCacheKey(windowId);
  if (cache === null) {
    sessionStorage.removeItem(key);
    return true;
  }
  return safeSessionStorageSetItem(key, JSON.stringify(cache));
};

export const cloneWindowState = (
  sourceWindowId: string,
  targetWindowId: string,
): boolean => {
  const sourceState = getWindowState(sourceWindowId);
  if (sourceState) {
    const clonedState = JSON.parse(JSON.stringify(sourceState));
    if (
      !safeSessionStorageSetItem(
        getCacheKey(targetWindowId),
        JSON.stringify(clonedState),
      )
    ) {
      return false;
    }
  }

  const sourceModelName = sessionStorage.getItem(
    getModelNameKey(sourceWindowId),
  );
  if (sourceModelName) {
    if (
      !safeSessionStorageSetItem(
        getModelNameKey(targetWindowId),
        sourceModelName,
      )
    ) {
      return false;
    }
  }
  const sourceModelProvider = sessionStorage.getItem(
    getModelProviderKey(sourceWindowId),
  );
  if (sourceModelProvider) {
    if (
      !safeSessionStorageSetItem(
        getModelProviderKey(targetWindowId),
        sourceModelProvider,
      )
    ) {
      return false;
    }
  }
  return true;
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
