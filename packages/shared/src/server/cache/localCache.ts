import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { recordGauge, recordIncrement } from "../instrumentation";

export type LocalCacheLoadResult<V> = {
  value: V | undefined;
  ttlMs?: number;
  source?: string;
};

export type LocalCacheConfig = {
  namespace: string;
  enabled: boolean;
  ttlMs?: number;
  max?: number;
};

export class LocalCache<V extends {}> {
  private readonly config: LocalCacheConfig;
  private readonly cache: LRUCache<string, V>;

  constructor(config: LocalCacheConfig) {
    this.config = config;
    const ttlMs = normalizePositiveNumber(config.ttlMs);
    const max = normalizePositiveNumber(config.max);

    const dispose: LRUCache.Disposer<string, V> = (_value, _key, reason) => {
      if (reason === "evict") {
        this.record("evict");
        this.recordSizeMetrics();
      }
    };

    const baseOptions = {
      ttlAutopurge: false as const,
      allowStale: false as const,
      updateAgeOnGet: false as const,
      updateAgeOnHas: false as const,
      dispose,
    };

    if (ttlMs !== undefined) {
      this.cache = new LRUCache<string, V>({
        ...baseOptions,
        ...(max !== undefined ? { max } : {}),
        ttl: ttlMs,
      });
      this.debug("Initialized local cache", {
        enabled: config.enabled,
        ttlMs,
        max,
        fallback: false,
      });
      return;
    }

    if (max !== undefined) {
      this.cache = new LRUCache<string, V>({
        ...baseOptions,
        max,
      });
      this.debug("Initialized local cache", {
        enabled: config.enabled,
        ttlMs: null,
        max,
        fallback: false,
      });
      return;
    }

    if (config.enabled) {
      logger.warn(
        `Local cache namespace ${config.namespace} is missing valid runtime limits; using a minimal fallback cache during initialization.`,
      );
    }

    this.cache = new LRUCache<string, V>({
      ...baseOptions,
      max: 1,
    });
    this.debug("Initialized local cache", {
      enabled: config.enabled,
      ttlMs: null,
      max: 1,
      fallback: true,
    });
  }

  get(key: string): V | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const value = this.cache.get(key);
    this.record(value === undefined ? "miss" : "hit");
    this.debug(value === undefined ? "Local cache miss" : "Local cache hit", {
      size: this.cache.size,
      keyLength: key.length,
    });

    return value;
  }

  set(key: string, value: V, ttlMs = this.config.ttlMs): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      const normalizedTtlMs = normalizePositiveNumber(ttlMs);
      this.cache.set(
        key,
        value,
        normalizedTtlMs === undefined ? undefined : { ttl: normalizedTtlMs },
      );
      this.record("set");
      this.recordSizeMetrics();
      this.debug("Stored local cache entry", {
        ttlMs: normalizedTtlMs ?? null,
        size: this.cache.size,
        keyLength: key.length,
      });
    } catch (error) {
      logger.error(
        `Failed to set local cache entry for namespace ${this.config.namespace}`,
        error,
      );
    }
  }

  clear(): void {
    this.cache.clear();
    this.record("clear");
    this.recordSizeMetrics();
    this.debug("Cleared local cache");
  }

  async getOrLoad(
    key: string,
    loader: () => Promise<LocalCacheLoadResult<V>>,
  ): Promise<LocalCacheLoadResult<V>> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return { value: cached, source: "local" };
    }

    if (!this.config.enabled) {
      this.debug("Bypassing disabled local cache", {
        keyLength: key.length,
      });
      return loader();
    }

    const result = await loader();
    this.debug("Completed local cache load", {
      source: result.source ?? "unknown",
      cacheable: result.value !== undefined,
      ttlMs: result.ttlMs ?? null,
      keyLength: key.length,
    });

    if (result.value !== undefined) {
      this.set(key, result.value, result.ttlMs);
    }

    return result;
  }

  private record(metric: string): void {
    recordIncrement(`langfuse.local_cache.${metric}`, 1, {
      namespace: this.config.namespace,
    });
  }

  private recordSizeMetrics(): void {
    recordGauge("langfuse.local_cache.size_entries", this.cache.size, {
      namespace: this.config.namespace,
    });
  }

  private debug(message: string, metadata?: Record<string, unknown>): void {
    if (!logger.isLevelEnabled("debug")) {
      return;
    }

    const formattedMetadata =
      metadata === undefined ? "" : ` ${safeSerialize(metadata)}`;

    logger.debug(
      `[LocalCache:${this.config.namespace}] ${message}${formattedMetadata}`,
    );
  }
}

const safeSerialize = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unserializable]";
  }
};

const normalizePositiveNumber = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
};
