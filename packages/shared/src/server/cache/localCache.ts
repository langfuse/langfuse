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
  ttlMs: number;
  max: number;
};

export class LocalCache<V extends {}> {
  private readonly config: LocalCacheConfig;
  private readonly cache: LRUCache<string, V>;

  constructor(config: LocalCacheConfig) {
    this.config = config;
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

    this.cache = new LRUCache<string, V>({
      ...baseOptions,
      ttl: config.ttlMs,
      max: config.max,
    });
    this.logInfo("Initialized local cache", {
      enabled: config.enabled,
      ttlMs: config.ttlMs,
      max: config.max,
    });
  }

  get(key: string): V | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const value = this.cache.get(key);
    this.record(value === undefined ? "miss" : "hit");
    this.logDebug(
      value === undefined ? "Local cache miss" : "Local cache hit",
      {
        size: this.cache.size,
        keyLength: key.length,
      },
    );

    return value;
  }

  set(key: string, value: V): void {
    if (!this.config.enabled) {
      return;
    }

    const ttlMs = this.config.ttlMs;

    try {
      this.cache.set(key, value, { ttl: ttlMs });
      this.record("set");
      this.recordSizeMetrics();
      this.logDebug("Stored local cache entry", {
        ttlMs,
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
    this.logDebug("Cleared local cache");
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
      this.logDebug("Bypassing disabled local cache", {
        keyLength: key.length,
      });
      return loader();
    }

    const result = await loader();
    this.logDebug("Completed local cache load", {
      source: result.source ?? "unknown",
      cacheable: result.value !== undefined,
      ttlMs: result.ttlMs ?? null,
      keyLength: key.length,
    });

    if (result.value !== undefined) {
      this.set(key, result.value);
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

  private logDebug(message: string, metadata?: Record<string, unknown>): void {
    if (!logger.isLevelEnabled("debug")) {
      return;
    }

    const formattedMetadata =
      metadata === undefined ? "" : ` ${safeSerialize(metadata)}`;

    logger.debug(
      `[LocalCache:${this.config.namespace}] ${message}${formattedMetadata}`,
    );
  }

  private logInfo(message: string, metadata?: Record<string, unknown>): void {
    const formattedMetadata =
      metadata === undefined ? "" : ` ${safeSerialize(metadata)}`;

    logger.info(
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
