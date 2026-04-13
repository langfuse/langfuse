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
  ttlMs?: number;
  max?: number;
  maxSize?: number;
  maxEntrySize?: number;
  sizeCalculation: (value: V, key: K) => number;
};

type NormalizedLocalCacheConfig<K extends {}, V extends {}> = {
  namespace: string;
  enabled: boolean;
  ttlMs?: number;
  max?: number;
  maxSize?: number;
  maxEntrySize?: number;
  sizeCalculation: (value: V, key: K) => number;
};

export class LocalCache<K extends {}, V extends {}> {
  private readonly config: NormalizedLocalCacheConfig<K, V>;
  private readonly cache: LRUCache<K, V>;
  private readonly inflightLoads = new Map<
    K,
    Promise<LocalCacheLoadResult<V>>
  >();

  constructor(config: LocalCacheConfig<K, V>) {
    this.config = normalizeLocalCacheConfig(config);
    this.cache = new LRUCache<K, V>(
      buildCacheOptions(this.config, () => {
        this.record("evict");
        this.recordSizeMetrics();
      }),
    );
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
      const normalizedTtlMs = normalizePositiveNumber(ttlMs);
      this.cache.set(
        key,
        value,
        normalizedTtlMs === undefined ? undefined : { ttl: normalizedTtlMs },
      );
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

type LocalCacheBaseOptions<K extends {}, V extends {}> = {
  allowStale: false;
  ttlAutopurge: false;
  updateAgeOnGet: false;
  updateAgeOnHas: false;
  dispose: NonNullable<LRUCache.OptionsBase<K, V, unknown>["dispose"]>;
};

type LocalCacheSizingOptions<K extends {}, V extends {}> = Partial<
  Pick<LRUCache.OptionsBase<K, V, unknown>, "maxEntrySize" | "sizeCalculation">
>;

const buildCacheOptions = <K extends {}, V extends {}>(
  config: NormalizedLocalCacheConfig<K, V>,
  onEvict: () => void,
): LRUCache.Options<K, V, unknown> => {
  const baseOptions: LocalCacheBaseOptions<K, V> = {
    ttlAutopurge: false,
    allowStale: false,
    updateAgeOnGet: false,
    updateAgeOnHas: false,
    dispose: (_value, _key, reason) => {
      if (reason === "evict") {
        onEvict();
      }
    },
  };

  const sizingOptions: LocalCacheSizingOptions<K, V> =
    config.maxSize !== undefined || config.maxEntrySize !== undefined
      ? {
          ...(config.maxEntrySize !== undefined
            ? { maxEntrySize: config.maxEntrySize }
            : {}),
          sizeCalculation: config.sizeCalculation,
        }
      : {};

  if (
    config.maxSize === undefined &&
    config.maxEntrySize === undefined &&
    config.enabled
  ) {
    logger.warn(
      `Local cache namespace ${config.namespace} is missing valid size bounds; falling back to count and TTL limits only.`,
    );
  }

  if (config.maxSize !== undefined) {
    return {
      ...baseOptions,
      ...sizingOptions,
      ...(config.max !== undefined ? { max: config.max } : {}),
      ...(config.ttlMs !== undefined ? { ttl: config.ttlMs } : {}),
      maxSize: config.maxSize,
    };
  }

  if (config.ttlMs !== undefined) {
    return {
      ...baseOptions,
      ...sizingOptions,
      ...(config.max !== undefined ? { max: config.max } : {}),
      ttl: config.ttlMs,
    };
  }

  if (config.max !== undefined) {
    return {
      ...baseOptions,
      ...sizingOptions,
      max: config.max,
    };
  }

  if (config.enabled) {
    logger.warn(
      `Local cache namespace ${config.namespace} is missing valid runtime limits; using a minimal fallback cache during initialization.`,
    );
  }

  return {
    ...baseOptions,
    ...sizingOptions,
    max: 1,
  };
};

const normalizeLocalCacheConfig = <K extends {}, V extends {}>(
  config: LocalCacheConfig<K, V>,
): NormalizedLocalCacheConfig<K, V> => ({
  ...config,
  ttlMs: normalizePositiveNumber(config.ttlMs),
  max: normalizePositiveNumber(config.max),
  maxSize: normalizePositiveNumber(config.maxSize),
  maxEntrySize: normalizePositiveNumber(config.maxEntrySize),
});

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
