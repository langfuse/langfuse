import { describe, expect, it } from "vitest";
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
