import { LRUCache } from "lru-cache";
import { logger } from "../logger";
import { recordGauge, recordIncrement } from "../instrumentation";

export type LocalCacheLoadResult<V> = {
  value: V | undefined;
  ttlMs?: number;
  source?: string;
};

export type LocalCacheConfig<K extends {}, V extends {}> = {
  namespace: string;
  enabled: boolean;
  ttlMs: number;
  max: number;
  maxSize: number;
  maxEntrySize?: number;
  sizeCalculation: (value: V, key: K) => number;
};

export class LocalCache<K extends {}, V extends {}> {
  private readonly cache: LRUCache<K, V>;
  private readonly inflightLoads = new Map<
    K,
    Promise<LocalCacheLoadResult<V>>
  >();

  constructor(private readonly config: LocalCacheConfig<K, V>) {
    const max = normalizePositiveNumber(config.max);
    const maxSize = normalizePositiveNumber(config.maxSize);
    const maxEntrySize = normalizePositiveNumber(config.maxEntrySize);

    const cacheOptions: LRUCache.Options<K, V, unknown> = {
      ttl: normalizePositiveNumber(config.ttlMs) ?? 0,
      ttlAutopurge: false,
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
      dispose: (_value, _key, reason) => {
        if (reason === "evict") {
          this.record("evict");
          this.recordSizeMetrics();
        }
      },
    };

    if (max !== undefined) {
      cacheOptions.max = max;
    }

    if (maxSize !== undefined) {
      cacheOptions.maxSize = maxSize;
    }

    if (maxEntrySize !== undefined) {
      cacheOptions.maxEntrySize = maxEntrySize;
    }

    if (maxSize !== undefined || maxEntrySize !== undefined) {
      cacheOptions.sizeCalculation = config.sizeCalculation;
    } else if (this.config.enabled) {
      logger.warn(
        `Local cache namespace ${this.config.namespace} is missing valid size bounds; falling back to count and TTL limits only.`,
      );
    }

    this.cache = new LRUCache<K, V>(cacheOptions);
  }

  get(key: K): V | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    const value = this.cache.get(key);
    this.record(value === undefined ? "miss" : "hit");

    return value;
  }

  set(key: K, value: V, ttlMs = this.config.ttlMs): void {
    if (!this.config.enabled) {
      return;
    }

    try {
      this.cache.set(key, value, { ttl: ttlMs });
      this.record("set");
      this.recordSizeMetrics();
    } catch (error) {
      logger.error(
        `Failed to set local cache entry for namespace ${this.config.namespace}`,
        error,
      );
    }
  }

  clear(): void {
    this.cache.clear();
    this.inflightLoads.clear();
    this.record("clear");
    this.recordSizeMetrics();
  }

  async getOrLoad(
    key: K,
    loader: () => Promise<LocalCacheLoadResult<V>>,
  ): Promise<LocalCacheLoadResult<V>> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return { value: cached, source: "local" };
    }

    if (!this.config.enabled) {
      return loader();
    }

    const inflight = this.inflightLoads.get(key);
    if (inflight) {
      this.record("inflight_join");
      return inflight;
    }

    const loadPromise = (async () => {
      const result = await loader();

      if (result.value !== undefined) {
        this.set(key, result.value, result.ttlMs);
      }

      return result;
    })();

    this.inflightLoads.set(key, loadPromise);

    try {
      return await loadPromise;
    } finally {
      this.inflightLoads.delete(key);
    }
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
    recordGauge("langfuse.local_cache.size_bytes", this.cache.calculatedSize, {
      namespace: this.config.namespace,
    });
  }
}

export const getJsonEntrySize = (key: string, value: unknown): number => {
  const serializedValue = JSON.stringify(value) ?? "undefined";

  return (
    Buffer.byteLength(key, "utf8") + Buffer.byteLength(serializedValue, "utf8")
  );
};

export const kilobytesToBytes = (valueInKb: number): number => valueInKb * 1024;

export const megabytesToBytes = (valueInMb: number): number =>
  valueInMb * 1024 * 1024;

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
