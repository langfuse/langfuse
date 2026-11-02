import { describe, expect, it, vi } from "vitest";
import { LocalCache } from "../../../packages/shared/src/server";

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

  it("should load and cache uncached values", async () => {
    const cache = new LocalCache<{ value: string }>({
      namespace: "test",
      enabled: true,
      ttlMs: 1000,
      max: 10,
    });

    const loader = vi.fn(async () => ({
      value: { value: "loaded" },
      source: "loader",
    }));

    const result = await cache.getOrLoad("entry", loader);

    expect(result.value).toEqual({ value: "loaded" });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.get("entry")).toEqual({ value: "loaded" });
  });

  it("should bypass reads and writes when disabled", () => {
    const cache = new LocalCache<{ value: string }>({
      namespace: "test",
      enabled: false,
      ttlMs: 1000,
      max: 10,
    });

    cache.set("entry", { value: "cached" });

    expect(cache.get("entry")).toBeUndefined();
  });
});
