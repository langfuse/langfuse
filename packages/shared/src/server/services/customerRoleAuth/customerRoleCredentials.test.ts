import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCache } from "./customerRoleCredentials";

const credentials = (expiresInMs: number) => ({
  accessKeyId: `key-${expiresInMs}`,
  secretAccessKey: "secret",
  expiration: new Date(Date.now() + expiresInMs),
});

describe("createSessionCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a still-valid session when its refresh fails", async () => {
    const cache = createSessionCache();
    const expiring = credentials(5 * 60 * 1000);
    await cache("key", "v1", async () => expiring);

    const failingRefresh = vi.fn().mockRejectedValue(new Error("Throttling"));
    await expect(cache("key", "v1", failingRefresh)).resolves.toBe(expiring);
    await vi.waitFor(() => expect(failingRefresh).toHaveBeenCalledTimes(1));
    await expect(cache("key", "v1", failingRefresh)).resolves.toBe(expiring);
  });

  it("backs off after a failure when no valid session exists", async () => {
    const cache = createSessionCache();
    const assume = vi.fn().mockRejectedValue(new Error("AccessDenied"));

    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    expect(assume).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(31 * 1000);
    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    expect(assume).toHaveBeenCalledTimes(2);

    const fixed = credentials(60 * 60 * 1000);
    await expect(cache("key", "v2", async () => fixed)).resolves.toBe(fixed);
  });
});
