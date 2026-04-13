import { describe, expect, it, vi } from "vitest";
import { LocalCache } from "@langfuse/shared/src/server";

describe("LocalCache", () => {
  it("should expire entries after ttl", async () => {
    const cache = new LocalCache<{ value: string }>({
      namespace: "test",
      enabled: true,
      ttlMs: 50,
      max: 10,
    });

    cache.set("entry", { value: "cached" });
    expect(cache.get("entry")).toEqual({ value: "cached" });

    await new Promise((resolve) => setTimeout(resolve, 75));

    expect(cache.get("entry")).toBeUndefined();
  });

  it("should deduplicate concurrent loads", async () => {
    const cache = new LocalCache<{ value: string }>({
      namespace: "test",
      enabled: true,
      ttlMs: 1000,
      max: 10,
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

  it("should fall back to a minimal cache when runtime limits are invalid", () => {
    const createCache = () =>
      new LocalCache<{ value: string }>({
        namespace: "test",
        enabled: true,
        max: Number.NaN,
      });

    expect(createCache).not.toThrow();

    const cache = createCache();
    cache.set("entry", { value: "cached" });

    expect(cache.get("entry")).toEqual({ value: "cached" });
  });

  it("should initialize disabled caches even when runtime limits are missing", () => {
    const createCache = () =>
      new LocalCache<{ value: string }>({
        namespace: "test",
        enabled: false,
      });

    expect(createCache).not.toThrow();
  });
});
