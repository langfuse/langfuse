import { useEffect, useState } from "react";
import { type PlaygroundCache } from "../types";
import { getCacheKey } from "../storage/keys";

/**
 * Hook for managing playground cache with window isolation support.
 * Relies on storage utilities for key generation and persistence.
 *
 * @param windowId - Optional window identifier for state isolation.
 * @returns Object with playgroundCache state and setPlaygroundCache function.
 */
export default function usePlaygroundCache(windowId?: string) {
  const playgroundCacheKey = getCacheKey(windowId ?? "");

  // Initialize synchronously from sessionStorage to avoid race conditions
  // with effects that depend on playgroundCache being available on first render
  const [cache, setCache] = useState<PlaygroundCache>(() => {
    if (typeof window === "undefined") return null;
    const savedCache = sessionStorage.getItem(playgroundCacheKey);
    if (savedCache) {
      try {
        return JSON.parse(savedCache);
      } catch (e) {
        console.error(
          `Failed to parse playground cache for window ${windowId}`,
          e,
        );
        sessionStorage.removeItem(playgroundCacheKey);
        return null;
      }
    }
    return null;
  });

  /**
   * Set playground cache for this specific window.
   * Stores the cache in sessionStorage with a window-specific key.
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

  // Handle windowId changes - re-read from storage if key changes
  useEffect(() => {
    const savedCache = sessionStorage.getItem(playgroundCacheKey);
    if (savedCache) {
      try {
        setCache(JSON.parse(savedCache));
      } catch (e) {
        console.error(
          `Failed to parse playground cache for window ${windowId}`,
          e,
        );
        sessionStorage.removeItem(playgroundCacheKey);
        setCache(null);
      }
    } else {
      setCache(null);
    }
  }, [playgroundCacheKey, windowId]);

  return {
    playgroundCache: cache,
    setPlaygroundCache: setPlaygroundCache,
  };
}
