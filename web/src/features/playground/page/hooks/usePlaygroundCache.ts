import { useEffect, useState } from "react";
import { type PlaygroundCache } from "../types";
import { getCacheKey } from "../storage/keys";

const readCache = (key: string): PlaygroundCache => {
  if (typeof window === "undefined") return null;
  const saved = sessionStorage.getItem(key);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
};

/**
 * Hook for managing playground cache with window isolation support.
 * Cache is read synchronously to avoid race conditions with effects
 * that depend on playgroundCache being available on first render.
 */
export default function usePlaygroundCache(windowId?: string) {
  const cacheKey = getCacheKey(windowId ?? "");
  const [cache, setCache] = useState<PlaygroundCache>(() =>
    readCache(cacheKey),
  );

  // Re-read when key changes (windowId change)
  useEffect(() => {
    setCache(readCache(cacheKey));
  }, [cacheKey]);

  const setPlaygroundCache = (newCache: PlaygroundCache) => {
    if (newCache === null) {
      sessionStorage.removeItem(cacheKey);
    } else {
      sessionStorage.setItem(cacheKey, JSON.stringify(newCache));
    }
  };

  return { playgroundCache: cache, setPlaygroundCache };
}
