import { useEffect, useState } from "react";

import { getIsCloudEnvironment } from "@/src/ee/utils/getIsCloudEnvironment";
import { type PlaygroundCache } from "../types";

const playgroundCacheKey = "playgroundCache";

export default function usePlaygroundCache() {
  const [cache, setCache] = useState<PlaygroundCache>(null);

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
    playgroundCache: getIsCloudEnvironment() ? cache : null,
    setPlaygroundCache: getIsCloudEnvironment() ? setPlaygroundCache : () => {},
  };
}
