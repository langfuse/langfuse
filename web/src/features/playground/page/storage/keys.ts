import { MULTI_WINDOW_CONFIG } from "../types";

export const WINDOW_IDS_KEY = "playgroundWindowIds";

const getPrefixedKey = (prefix: string, windowId: string) => {
  const effectiveWindowId = windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
  if (effectiveWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID) {
    return prefix.endsWith("_") ? prefix.slice(0, -1) : prefix;
  }
  return `${prefix}${effectiveWindowId}`;
};

export const getCacheKey = (windowId: string) =>
  getPrefixedKey("langfuse-playgroundCache_", windowId);

export const getModelNameKey = (windowId: string) =>
  getPrefixedKey("langfuse-llmModelName_", windowId);

export const getModelProviderKey = (windowId: string) =>
  getPrefixedKey("langfuse-llmModelProvider_", windowId);
