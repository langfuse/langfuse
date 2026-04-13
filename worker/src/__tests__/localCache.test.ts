import { describe, expect, it, vi } from "vitest";
import { LocalCache, getJsonEntrySize } from "@langfuse/shared/src/server";

describe("LocalCache", () => {
  it("should expire entries after ttl", async () => {
    const cache = new LocalCache<string, { value: string }>({
      namespace: "test",
      enabled: true,
      ttlMs: 50,
      max: 10,
      maxSize: 1024,
      sizeCalculation: (value, key) => getJsonEntrySize(key, value),
    });

    cache.set("entry", { value: "cached" });
    expect(cache.get("entry")).toEqual({ value: "cached" });

    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(cache.get("entry")).toBeUndefined();
  });

  it("should deduplicate concurrent loads", async () => {
    const cache = new LocalCache<string, { value: string }>({
      namespace: "test",
      enabled: true,
      ttlMs: 1000,
      max: 10,
      maxSize: 1024,
      sizeCalculation: (value, key) => getJsonEntrySize(key, value),
    });

    const loader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return {
        value: { value: "loaded" },
        source: "loader",
      };
    });

    const [first, second] = await Promise.all([
      cache.getOrLoad("entry", loader),
      cache.getOrLoad("entry", loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first.value).toEqual({ value: "loaded" });
    expect(second.value).toEqual({ value: "loaded" });
  });

  it("should ignore invalid size bounds and fall back to count-based eviction", () => {
    const createCache = () =>
      new LocalCache<string, { value: string }>({
        namespace: "test",
        enabled: true,
        ttlMs: 1000,
        max: 10,
        maxSize: Number.NaN,
        sizeCalculation: (value, key) => getJsonEntrySize(key, value),
      });

    expect(createCache).not.toThrow();

    const cache = createCache();
    cache.set("entry", { value: "cached" });

    expect(cache.get("entry")).toEqual({ value: "cached" });
  });

  it("should initialize disabled caches even when runtime limits are missing", () => {
    const createCache = () =>
      new LocalCache<string, { value: string }>({
        namespace: "test",
        enabled: false,
        ttlMs: undefined as unknown as number,
        max: undefined as unknown as number,
        maxSize: undefined as unknown as number,
        sizeCalculation: (value, key) => getJsonEntrySize(key, value),
      });

    expect(createCache).not.toThrow();
  });
});
