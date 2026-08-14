import { describe, expect, it, vi } from "vitest";

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
  redis: null,
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
}));

import { FALLBACK_LATEST_SDK_VERSIONS } from "@/src/features/v4-migration/latestSdkVersions";
import {
  createLatestSdkVersionsResolver,
  type LatestSdkVersionsResolverDependencies,
} from "@/src/features/v4/server/latestSdkVersions";

const PYPI_URL = "https://pypi.org/pypi/langfuse/json";
const NPM_URL = "https://registry.npmjs.org/@langfuse/tracing/latest";

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const errorResponse = (status: number) =>
  ({
    ok: false,
    status,
    json: async () => ({}),
  }) as Response;

const registryFetch = (
  responses: Partial<Record<string, () => Response | Promise<Response>>>,
) =>
  vi.fn(async (input: RequestInfo | URL) => {
    const respond = responses[String(input)];
    if (!respond) throw new Error(`Unexpected fetch: ${String(input)}`);
    return respond();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

const healthyRegistries = () =>
  registryFetch({
    [PYPI_URL]: () => jsonResponse({ info: { version: "4.20.0" } }),
    [NPM_URL]: () => jsonResponse({ version: "5.12.3" }),
  });

const createResolver = (
  overrides: Partial<LatestSdkVersionsResolverDependencies> = {},
) => {
  const fetchImpl = overrides.fetchImpl ?? healthyRegistries();
  const getCache = overrides.getCache ?? vi.fn().mockResolvedValue(null);
  const setCache = overrides.setCache ?? vi.fn().mockResolvedValue(undefined);
  const resolver = createLatestSdkVersionsResolver({
    fetchImpl,
    getCache,
    setCache,
  });
  return { fetchImpl, getCache, setCache, resolver };
};

describe("latest SDK versions registry lookup", () => {
  it("returns cached versions without hitting the registries", async () => {
    const cached = { python: "4.15.0", javascript: "5.11.0" };
    const { fetchImpl, setCache, resolver } = createResolver({
      getCache: vi.fn().mockResolvedValue(JSON.stringify(cached)),
    });

    await expect(resolver()).resolves.toEqual(cached);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(setCache).not.toHaveBeenCalled();
  });

  it("fetches both registries on cache miss and caches the result for 24h", async () => {
    const { fetchImpl, setCache, resolver } = createResolver();

    await expect(resolver()).resolves.toEqual({
      python: "4.20.0",
      javascript: "5.12.3",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(setCache).toHaveBeenCalledOnce();
    expect(setCache).toHaveBeenCalledWith(
      JSON.stringify({ python: "4.20.0", javascript: "5.12.3" }),
      24 * 60 * 60,
    );
  });

  it("falls back per registry and skips caching when one registry fails", async () => {
    const { setCache, resolver } = createResolver({
      fetchImpl: registryFetch({
        [PYPI_URL]: () => errorResponse(503),
        [NPM_URL]: () => jsonResponse({ version: "5.12.3" }),
      }),
    });

    await expect(resolver()).resolves.toEqual({
      python: FALLBACK_LATEST_SDK_VERSIONS.python,
      javascript: "5.12.3",
    });
    expect(setCache).not.toHaveBeenCalled();
  });

  it("returns the pinned fallback when both registries are down", async () => {
    const { setCache, resolver } = createResolver({
      fetchImpl: registryFetch({
        [PYPI_URL]: () => {
          throw new Error("network down");
        },
        [NPM_URL]: () => {
          throw new Error("network down");
        },
      }),
    });

    await expect(resolver()).resolves.toEqual(FALLBACK_LATEST_SDK_VERSIONS);
    expect(setCache).not.toHaveBeenCalled();
  });

  it("rejects registry payloads that are not version strings", async () => {
    const { setCache, resolver } = createResolver({
      fetchImpl: registryFetch({
        [PYPI_URL]: () => jsonResponse({ info: { version: "<html>oops" } }),
        [NPM_URL]: () => jsonResponse({ version: 42 }),
      }),
    });

    await expect(resolver()).resolves.toEqual(FALLBACK_LATEST_SDK_VERSIONS);
    expect(setCache).not.toHaveBeenCalled();
  });

  it("ignores corrupt cache entries and refetches", async () => {
    const { fetchImpl, resolver } = createResolver({
      getCache: vi.fn().mockResolvedValue("not-json{"),
    });

    await expect(resolver()).resolves.toEqual({
      python: "4.20.0",
      javascript: "5.12.3",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ignores cache entries with invalid version shapes", async () => {
    const { fetchImpl, resolver } = createResolver({
      getCache: vi.fn().mockResolvedValue(JSON.stringify({ python: "4.15.0" })),
    });

    await expect(resolver()).resolves.toEqual({
      python: "4.20.0",
      javascript: "5.12.3",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("survives cache read and write failures", async () => {
    const { resolver } = createResolver({
      getCache: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
      setCache: vi.fn().mockRejectedValue(new Error("Redis unavailable")),
    });

    await expect(resolver()).resolves.toEqual({
      python: "4.20.0",
      javascript: "5.12.3",
    });
  });

  it("deduplicates concurrent lookups into one registry round-trip", async () => {
    const { fetchImpl, resolver } = createResolver();

    const [first, second] = await Promise.all([resolver(), resolver()]);

    expect(first).toEqual(second);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries after a completed lookup instead of memoizing forever", async () => {
    const { fetchImpl, resolver } = createResolver();

    await resolver();
    await resolver();

    // Redis is the cross-request cache; the in-process memo only spans
    // concurrent calls, so a second sequential call consults deps again.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
