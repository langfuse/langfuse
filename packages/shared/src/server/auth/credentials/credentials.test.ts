import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

const azureMocks = vi.hoisted(() => ({
  defaultGetToken: vi.fn(),
  managedGetToken: vi.fn(),
  managedCtor: vi.fn(),
}));

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class {
    getToken = azureMocks.defaultGetToken;
  },
  ManagedIdentityCredential: class {
    constructor(options: unknown) {
      azureMocks.managedCtor(options);
    }
    getToken = azureMocks.managedGetToken;
  },
}));

const envMock = vi.hoisted(() => ({
  env: {
    REDIS_AUTH_METHOD: "static" as "static" | "azure_managed_identity",
    REDIS_USERNAME: undefined as string | undefined | null,
    REDIS_AZURE_CLIENT_ID: undefined as string | undefined,
    REDIS_AZURE_SCOPE: "https://redis.azure.com/.default" as string,
    NODE_ENV: "test" as string,
  },
}));
vi.mock("../../../env", () => envMock);

// Mock the logger so the real env is not loaded through it.
vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  AZURE_REDIS_SCOPE,
  AzureManagedIdentityCredentialProvider,
} from "./azureManagedIdentity";
import {
  bindManagedCredentialToRedis,
  getRedisManagedCredentialProviderFromEnv,
  initializeRedisManagedCredentials,
  resetRedisManagedCredentialsForTests,
} from "./redisCredentials";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";
import { logger } from "../../logger";

const ONE_HOUR = 60 * 60 * 1000;

// Controllable provider for the bind tests.
function fakeProvider(
  options: { username?: string; ttlMs?: number } = {},
): ManagedCredentialProvider & {
  fetchToken: ReturnType<typeof vi.fn>;
} {
  const ttl = options.ttlMs ?? ONE_HOUR;
  let counter = 0;
  return {
    name: "fake",
    username: options.username,
    fetchToken: vi.fn(
      async (): Promise<ManagedAccessToken> => ({
        token: `token-${++counter}`,
        expiresOnTimestamp: Date.now() + ttl,
      }),
    ),
  };
}

/**
 * Mirrors ioredis where it matters here: `duplicate()` is
 * `new Redis({ ...this.options })`, so a copy is a fresh instance that inherits
 * no event subscriptions and holds a by-value snapshot of the options.
 */
function fakeRedisClient() {
  const handlers: Record<string, () => void> = {};
  const client = {
    options: {} as { username?: string; password?: string },
    status: "wait" as string,
    handlers,
    connect: vi.fn(async () => {
      client.status = "ready";
    }),
    call: vi.fn(async () => "OK"),
    once: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    duplicate: vi.fn(() => {
      const copy = fakeRedisClient();
      copy.options = { ...client.options };
      return copy;
    }),
  };
  return client;
}

/** Lets the deduplicated first token fetch settle. */
const settle = () => vi.advanceTimersByTimeAsync(1);

beforeEach(() => {
  azureMocks.defaultGetToken.mockReset();
  azureMocks.managedGetToken.mockReset();
  azureMocks.managedCtor.mockReset();
  envMock.env.REDIS_AUTH_METHOD = "static";
  envMock.env.REDIS_USERNAME = undefined;
  envMock.env.REDIS_AZURE_CLIENT_ID = undefined;
  envMock.env.REDIS_AZURE_SCOPE = "https://redis.azure.com/.default";
  envMock.env.NODE_ENV = "test";
  (logger.warn as ReturnType<typeof vi.fn>).mockClear();
  resetRedisManagedCredentialsForTests();
});

afterEach(() => {
  resetRedisManagedCredentialsForTests();
  vi.useRealTimers();
});

describe("AzureManagedIdentityCredentialProvider", () => {
  it("requests the configured scope via DefaultAzureCredential (system-assigned)", async () => {
    azureMocks.defaultGetToken.mockResolvedValue({
      token: "azure-access-token",
      expiresOnTimestamp: Date.now() + ONE_HOUR,
    });

    const provider = new AzureManagedIdentityCredentialProvider({
      scope: AZURE_REDIS_SCOPE,
      username: "object-id-123",
    });
    const token = await provider.fetchToken();

    expect(token.token).toBe("azure-access-token");
    expect(provider.username).toBe("object-id-123");
    expect(provider.name).toBe("azure_managed_identity");
    expect(azureMocks.defaultGetToken).toHaveBeenCalledWith(AZURE_REDIS_SCOPE);
    expect(azureMocks.managedCtor).not.toHaveBeenCalled();
  });

  it("uses ManagedIdentityCredential with clientId (user-assigned)", async () => {
    azureMocks.managedGetToken.mockResolvedValue({
      token: "user-assigned-token",
      expiresOnTimestamp: Date.now() + ONE_HOUR,
    });

    const provider = new AzureManagedIdentityCredentialProvider({
      scope: AZURE_REDIS_SCOPE,
      clientId: "client-abc",
    });
    const token = await provider.fetchToken();

    expect(token.token).toBe("user-assigned-token");
    expect(azureMocks.managedCtor).toHaveBeenCalledWith({
      clientId: "client-abc",
    });
    expect(azureMocks.defaultGetToken).not.toHaveBeenCalled();
  });

  it("throws when the credential yields no token", async () => {
    azureMocks.defaultGetToken.mockResolvedValue(null);
    const provider = new AzureManagedIdentityCredentialProvider({
      scope: AZURE_REDIS_SCOPE,
    });
    await expect(provider.fetchToken()).rejects.toThrow(/no token/);
  });
});

describe("bindManagedCredentialToRedis", () => {
  it("writes the token to options and re-AUTHs a live socket on refresh", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );

    expect(client.connect).not.toHaveBeenCalled();

    await settle();
    expect(client.options.password).toBe("token-1");
    expect(client.options.username).toBe("object-id-123");

    client.status = "ready";
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.options.password).toBe("token-2");
    expect(client.call).toHaveBeenCalledWith(
      "AUTH",
      "object-id-123",
      "token-2",
    );
    manager.stop();
  });

  it("updates options but issues no AUTH for a client that never connected", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const client = fakeRedisClient(); // stays in "wait"

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();

    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.options.password).toBe("token-2");
    // Commanding an unconnected client would force a connection nobody asked for.
    expect(client.call).not.toHaveBeenCalled();
    manager.stop();
  });

  it("retries the initial fetch on a later connection after a failure", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    provider.fetchToken.mockRejectedValueOnce(
      new Error("token endpoint unavailable"),
    );

    const first = fakeRedisClient();
    bindManagedCredentialToRedis(first as unknown as Redis, provider);
    await settle();
    expect(first.options.password).toBeUndefined();

    // The rejected promise is cleared, so a later connection retries rather than
    // inheriting the failure for the lifetime of the process.
    const second = fakeRedisClient();
    const manager = bindManagedCredentialToRedis(
      second as unknown as Redis,
      provider,
    );
    await settle();
    expect(second.options.password).toBe("token-1");
    manager.stop();
  });

  it("shares one token across every connection", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const clients = [
      fakeRedisClient(),
      fakeRedisClient(),
      fakeRedisClient(),
      fakeRedisClient(),
    ];

    const managers = clients.map((c) =>
      bindManagedCredentialToRedis(c as unknown as Redis, provider),
    );
    await settle();

    // One request, not one per connection -- the metadata endpoint throttles.
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);
    for (const c of clients) expect(c.options.password).toBe("token-1");
    expect(new Set(managers).size).toBe(1);
    managers[0].stop();
  });

  it("keeps duplicated connections refreshing on the shared token", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();

    const blocking = client.duplicate();
    blocking.status = "ready";
    client.status = "ready";
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    // Before duplicate() was bound the copy kept a stale password and died at the
    // first expiry, halting consumption while producers kept succeeding.
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.options.password).toBe("token-2");
    expect(blocking.options.password).toBe("token-2");
    expect(blocking.call).toHaveBeenCalledWith(
      "AUTH",
      "object-id-123",
      "token-2",
    );
    manager.stop();
  });

  it("refreshes connections duplicated from a duplicate", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const client = fakeRedisClient();

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();

    const nested = client.duplicate().duplicate();
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(nested.options.password).toBe("token-2");
    manager.stop();
  });

  it("never writes the credential into the logs when re-authentication fails", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();

    // ioredis attaches the command it sent -- credential included -- to reply
    // errors, and the logger serialises an Error's own enumerable properties.
    client.call.mockRejectedValue(
      Object.assign(new Error("WRONGPASS invalid username-password pair"), {
        command: { name: "auth", args: ["object-id-123", "token-2"] },
      }),
    );

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();
    client.status = "ready";
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    await settle();

    const calls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(calls)).not.toContain("token-2");
    // A lone string argument is what guarantees it: nothing is passed that could
    // carry the command payload.
    for (const call of calls) expect(call).toHaveLength(1);
    manager.stop();
  });

  it("re-registers a connection that reconnects after ending", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();

    // BullMQ revives the same instance via RedisConnection.reconnect().
    client.handlers.end();
    client.handlers.connect();
    client.status = "ready";

    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.options.password).toBe("token-2");
    expect(client.call).toHaveBeenCalledWith(
      "AUTH",
      "object-id-123",
      "token-2",
    );
    manager.stop();
  });

  it("stops refreshing a connection once it has ended", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider();
    const client = fakeRedisClient();

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    await settle();
    client.status = "ready";

    // A closed connection must not keep receiving AUTH for every rotation.
    client.handlers.end();
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.call).not.toHaveBeenCalled();
    manager.stop();
  });
});

describe("initializeRedisManagedCredentials", () => {
  it("is a no-op under the default static auth", async () => {
    envMock.env.REDIS_AUTH_METHOD = "static";
    await expect(initializeRedisManagedCredentials()).resolves.toBeUndefined();
    expect(azureMocks.defaultGetToken).not.toHaveBeenCalled();
  });

  it("acquires the token once so later connections authenticate immediately", async () => {
    envMock.env.REDIS_AUTH_METHOD = "azure_managed_identity";
    envMock.env.REDIS_USERNAME = "object-id-xyz";
    azureMocks.defaultGetToken.mockResolvedValue({
      token: "pre-warmed-token",
      expiresOnTimestamp: Date.now() + ONE_HOUR,
    });

    await initializeRedisManagedCredentials();
    await initializeRedisManagedCredentials(); // idempotent
    expect(azureMocks.defaultGetToken).toHaveBeenCalledTimes(1);

    // Authenticated synchronously at construction -- no cold-start window.
    const provider = getRedisManagedCredentialProviderFromEnv();
    const client = fakeRedisClient();
    bindManagedCredentialToRedis(client as unknown as Redis, provider!);
    expect(client.options.password).toBe("pre-warmed-token");
    expect(client.options.username).toBe("object-id-xyz");
  });
});

describe("getRedisManagedCredentialProviderFromEnv", () => {
  it("returns null for the default static method (backward compatible)", () => {
    envMock.env.REDIS_AUTH_METHOD = "static";
    expect(getRedisManagedCredentialProviderFromEnv()).toBeNull();
  });

  it("builds an Azure provider with the object-id username and scope default", async () => {
    envMock.env.REDIS_AUTH_METHOD = "azure_managed_identity";
    envMock.env.REDIS_USERNAME = "object-id-xyz";
    azureMocks.defaultGetToken.mockResolvedValue({
      token: "scoped-token",
      expiresOnTimestamp: Date.now() + ONE_HOUR,
    });
    const provider = getRedisManagedCredentialProviderFromEnv();
    expect(provider).toBeInstanceOf(AzureManagedIdentityCredentialProvider);
    expect(provider?.name).toBe("azure_managed_identity");
    expect(provider?.username).toBe("object-id-xyz");

    // The scope default now comes from env.ts rather than a fallback in code.
    await provider?.fetchToken();
    expect(azureMocks.defaultGetToken).toHaveBeenCalledWith(AZURE_REDIS_SCOPE);
  });

  it("memoises the provider so one credential serves the whole process", () => {
    envMock.env.REDIS_AUTH_METHOD = "azure_managed_identity";
    const first = getRedisManagedCredentialProviderFromEnv();
    const second = getRedisManagedCredentialProviderFromEnv();
    expect(first).not.toBeNull();
    expect(first).toBe(second);
  });
});

describe("resetRedisManagedCredentialsForTests", () => {
  it("refuses to run in production, where it would stop all rotation", () => {
    envMock.env.NODE_ENV = "production";
    expect(() => resetRedisManagedCredentialsForTests()).toThrow(
      /must not be called in production/,
    );
    envMock.env.NODE_ENV = "test";
  });
});
