import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createSessionCache,
  FAILURE_BACKOFF_MS,
  MIN_REMAINING_MS,
  REFRESH_MARGIN_MS,
} from "./customerRoleCredentials";

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
    const expiring = credentials((REFRESH_MARGIN_MS + MIN_REMAINING_MS) / 2);
    await cache("key", "v1", async () => expiring);

    const failingRefresh = vi.fn().mockRejectedValue(new Error("Throttling"));
    await expect(cache("key", "v1", failingRefresh)).resolves.toBe(expiring);
    await vi.waitFor(() => expect(failingRefresh).toHaveBeenCalledTimes(1));
    await expect(cache("key", "v1", failingRefresh)).resolves.toBe(expiring);
    expect(failingRefresh).toHaveBeenCalledTimes(1);
  });

  it("waits for the refresh instead of serving a session about to expire", async () => {
    const cache = createSessionCache();
    await cache("key", "v1", async () => credentials(MIN_REMAINING_MS / 2));

    const refreshed = credentials(REFRESH_MARGIN_MS * 6);
    await expect(cache("key", "v1", async () => refreshed)).resolves.toBe(
      refreshed,
    );
  });

  it("backs off after a failure when no valid session exists", async () => {
    const cache = createSessionCache();
    const assume = vi.fn().mockRejectedValue(new Error("AccessDenied"));

    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    expect(assume).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(FAILURE_BACKOFF_MS + 1000);
    await expect(cache("key", "v1", assume)).rejects.toThrow("AccessDenied");
    expect(assume).toHaveBeenCalledTimes(2);

    const fixed = credentials(REFRESH_MARGIN_MS * 6);
    await expect(cache("key", "v2", async () => fixed)).resolves.toBe(fixed);
  });
});
