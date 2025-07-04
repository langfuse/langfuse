import { useEffect, useState } from "react";

import { type PlaygroundCache, MULTI_WINDOW_CONFIG } from "../types";

/**
 * Hook for managing playground cache with window isolation support
 * Supports both single-window and multi-window scenarios through window-specific cache keys
 *
 * @param windowId - Optional window identifier for state isolation. Defaults to "default" for backward compatibility
 * @returns Object with playgroundCache state and setPlaygroundCache function
 */
export default function usePlaygroundCache(windowId?: string) {
  const [cache, setCache] = useState<PlaygroundCache>(null);

  // Generate window-specific cache key
  // For backward compatibility, use the original key for the default window
  const effectiveWindowId = windowId || MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID;
  const playgroundCacheKey =
    effectiveWindowId === MULTI_WINDOW_CONFIG.DEFAULT_WINDOW_ID
      ? "playgroundCache"
      : `playgroundCache_${effectiveWindowId}`;

  /**
   * Set playground cache for this specific window
   * Stores the cache in sessionStorage with window-specific key
   *
   * @param cache - PlaygroundCache object to store, or null to clear
   */
  const setPlaygroundCache = (cache: PlaygroundCache) => {
    if (cache === null) {
      sessionStorage.removeItem(playgroundCacheKey);
    } else {
      sessionStorage.setItem(playgroundCacheKey, JSON.stringify(cache));
    }
  };

  /**
   * Load cached state from sessionStorage on mount and when windowId changes
   * Attempts to parse JSON and handles errors gracefully
   */
  useEffect(() => {
    const savedCache = sessionStorage.getItem(playgroundCacheKey);
    if (savedCache) {
      try {
        setCache(JSON.parse(savedCache));
      } catch (e) {
        console.error(
          `Failed to parse playground cache for window ${effectiveWindowId}`,
          e,
        );
        // Clear corrupted cache
        sessionStorage.removeItem(playgroundCacheKey);
        setCache(null);
      }
    } else {
      setCache(null);
    }
  }, [playgroundCacheKey, effectiveWindowId]);

  return {
    playgroundCache: cache,
    setPlaygroundCache: setPlaygroundCache,
  };
}
