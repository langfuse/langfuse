import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { RefreshingTokenManager } from "./RefreshingTokenManager";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

const ONE_HOUR = 60 * 60 * 1000;

function fakeProvider(
  options: { ttlMs?: number } = {},
): ManagedCredentialProvider & { fetchToken: ReturnType<typeof vi.fn> } {
  const ttl = options.ttlMs ?? ONE_HOUR;
  let counter = 0;
  return {
    name: "fake",
    fetchToken: vi.fn(
      async (): Promise<ManagedAccessToken> => ({
        token: `token-${++counter}`,
        expiresOnTimestamp: Date.now() + ttl,
      }),
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RefreshingTokenManager", () => {
  it("fetches the first token on start", async () => {
    const provider = fakeProvider();
    const manager = new RefreshingTokenManager(provider);

    const token = await manager.start();
    expect(token.token).toBe("token-1");
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);
    manager.stop();
  });

  it("refreshes ahead of expiry and notifies subscribers", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ ttlMs: ONE_HOUR });
    const manager = new RefreshingTokenManager(provider, {
      expirationRefreshRatio: 0.8,
    });
    const refreshed: string[] = [];
    manager.onRefresh((token) => refreshed.push(token.token));

    expect((await manager.start()).token).toBe("token-1");

    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8 - 1000);
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(provider.fetchToken).toHaveBeenCalledTimes(2);
    expect(refreshed).toEqual(["token-2"]);
    manager.stop();
  });

  it("stops scheduling after stop()", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const manager = new RefreshingTokenManager(provider);
    await manager.start();
    manager.stop();
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 2);
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);
  });
});
