import { useEffect, useState } from "react";

import { type PlaygroundCache } from "../types";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

const playgroundCacheKeyBase = "playgroundCache";

export default function usePlaygroundCache(promptKey: number) {
  const playgroundCacheKey = playgroundCacheKeyBase + "_" + promptKey;
  const [cache, setCache] = useState<PlaygroundCache>(null);
  const available = useHasEntitlement("playground");
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
  }, [playgroundCacheKey]);

  return {
    playgroundCache: available ? cache : null,
    setPlaygroundCache: available ? setPlaygroundCache : () => { },
  };
}
