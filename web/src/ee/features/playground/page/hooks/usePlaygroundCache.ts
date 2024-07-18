import { useEffect, useState } from "react";

import { type PlaygroundCache } from "../types";
import { useIsEeEnabled } from "@/src/ee/utils/useIsEeEnabled";

const playgroundCacheKey = "playgroundCache";

export default function usePlaygroundCache() {
  const [cache, setCache] = useState<PlaygroundCache>(null);
  const isEeEnabled = useIsEeEnabled();
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
    playgroundCache: isEeEnabled ? cache : null,
    setPlaygroundCache: isEeEnabled ? setPlaygroundCache : () => {},
  };
}
