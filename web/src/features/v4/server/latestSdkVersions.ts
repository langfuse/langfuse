import { logger, redis } from "@langfuse/shared/src/server";

import {
  FALLBACK_LATEST_SDK_VERSIONS,
  type LatestSdkVersions,
} from "@/src/features/v4-migration/latestSdkVersions";

/**
 * Registry lookup for the latest released Langfuse SDK versions, backing the
 * Health page's freshness ("Behind") badges.
 *
 * Fixed registry URLs only — no user input reaches the fetches, so this is
 * SSRF-safe by construction. Results are cached in Redis for ~24h; on cache
 * miss + fetch failure the hardcoded FALLBACK_LATEST_SDK_VERSIONS are used.
 * This never throws to the caller.
 */

const CACHE_KEY = "langfuse:v4-migration:latest-sdk-versions:v1";
const CACHE_TTL_SECONDS = 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 5_000;

// Loose SemVer-ish check so a registry hiccup (HTML error page, empty body)
// can never poison the cache with a non-version string.
const VERSION_PATTERN = /^\d+\.\d+(\.\d+)?([-+.].*)?$/;

const REGISTRY_SOURCES: Record<
  keyof LatestSdkVersions,
  { url: string; extractVersion: (body: unknown) => unknown }
> = {
  python: {
    url: "https://pypi.org/pypi/langfuse/json",
    extractVersion: (body) =>
      (body as { info?: { version?: unknown } })?.info?.version,
  },
  javascript: {
    url: "https://registry.npmjs.org/@langfuse/tracing/latest",
    extractVersion: (body) => (body as { version?: unknown })?.version,
  },
};

const parseValidVersions = (value: string): LatestSdkVersions | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  const candidate = parsed as Partial<Record<keyof LatestSdkVersions, unknown>>;
  const python = candidate?.python;
  const javascript = candidate?.javascript;
  if (
    typeof python !== "string" ||
    typeof javascript !== "string" ||
    !VERSION_PATTERN.test(python) ||
    !VERSION_PATTERN.test(javascript)
  ) {
    return null;
  }
  return { python, javascript };
};

export type LatestSdkVersionsResolverDependencies = {
  fetchImpl: typeof fetch;
  getCache: () => Promise<string | null>;
  setCache: (value: string, ttlSeconds: number) => Promise<void>;
};

export const createLatestSdkVersionsResolver = ({
  fetchImpl,
  getCache,
  setCache,
}: LatestSdkVersionsResolverDependencies) => {
  let inFlight: Promise<LatestSdkVersions> | null = null;

  const fetchRegistryVersion = async (
    sdk: keyof LatestSdkVersions,
  ): Promise<string | null> => {
    const { url, extractVersion } = REGISTRY_SOURCES[sdk];
    try {
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Registry responded with status ${response.status}`);
      }
      const version = extractVersion(await response.json());
      if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
        throw new Error(`Registry returned an invalid version: ${version}`);
      }
      return version;
    } catch (error) {
      logger.warn("Failed to fetch latest SDK version from registry", {
        sdk,
        url,
        error,
      });
      return null;
    }
  };

  const resolve = async (): Promise<LatestSdkVersions> => {
    try {
      const cached = await getCache();
      if (cached) {
        const cachedVersions = parseValidVersions(cached);
        if (cachedVersions) return cachedVersions;
      }
    } catch (error) {
      logger.warn("Failed to read latest SDK versions from cache", { error });
    }

    const [python, javascript] = await Promise.all([
      fetchRegistryVersion("python"),
      fetchRegistryVersion("javascript"),
    ]);

    const versions: LatestSdkVersions = {
      python: python ?? FALLBACK_LATEST_SDK_VERSIONS.python,
      javascript: javascript ?? FALLBACK_LATEST_SDK_VERSIONS.javascript,
    };

    // Only cache fully successful lookups: a registry that was down should be
    // retried on the next request instead of pinning its fallback for 24h.
    if (python !== null && javascript !== null) {
      try {
        await setCache(JSON.stringify(versions), CACHE_TTL_SECONDS);
      } catch (error) {
        logger.warn("Failed to write latest SDK versions to cache", { error });
      }
    }

    return versions;
  };

  return (): Promise<LatestSdkVersions> => {
    // Deduplicate concurrent lookups within this web process so a cold cache
    // cannot fan out one registry request per concurrent Health page view.
    inFlight ??= resolve()
      .catch((error): LatestSdkVersions => {
        // Defense in depth: resolve() already degrades per step, but the
        // Health page must render even if something above still throws.
        logger.warn("Failed to resolve latest SDK versions", { error });
        return FALLBACK_LATEST_SDK_VERSIONS;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
};

export const getLatestSdkVersions = createLatestSdkVersionsResolver({
  fetchImpl: fetch,
  getCache: async () => (redis ? redis.get(CACHE_KEY) : null),
  setCache: async (value, ttlSeconds) => {
    if (!redis) return;
    await redis.set(CACHE_KEY, value, "EX", ttlSeconds);
  },
});
