import { useEffect, useState } from "react";

import { type PlaygroundCache } from "../types";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";

const playgroundCacheKey = "playgroundCache";

export default function usePlaygroundCache() {
  const [cache, setCache] = useState<PlaygroundCache>(null);
  const available = useHasOrgEntitlement("playground");
  const setPlaygroundCache = (cache: PlaygroundCache) => {
    sessionStorage.setItem(playgroundCacheKey, JSON.stringify(cache));
  };

  useEffect(() => {
    const savedCache = sessionStorage.getItem(playgroundCacheKey);
    if (savedCache) {
      try {
        setCache(JSON.parse(savedCache));
      } catch (e) {
        console.error("Failed to parse playground cache", e);
      }
    }
  }, []);

  return {
    playgroundCache: available ? cache : null,
    setPlaygroundCache: available ? setPlaygroundCache : () => {},
  };
}
