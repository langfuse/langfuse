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
    REDIS_AZURE_SCOPE: undefined as string | undefined,
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
} from "./redisCredentials";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

const ONE_HOUR = 60 * 60 * 1000;

// Controllable provider for the manager/bind tests.
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

beforeEach(() => {
  azureMocks.defaultGetToken.mockReset();
  azureMocks.managedGetToken.mockReset();
  azureMocks.managedCtor.mockReset();
  envMock.env.REDIS_AUTH_METHOD = "static";
  envMock.env.REDIS_USERNAME = undefined;
  envMock.env.REDIS_AZURE_CLIENT_ID = undefined;
  envMock.env.REDIS_AZURE_SCOPE = undefined;
});

afterEach(() => {
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
  function fakeRedisClient() {
    const client = {
      options: {} as { username?: string; password?: string },
      status: "wait" as string,
      connect: vi.fn(async () => {
        client.status = "ready";
      }),
      call: vi.fn(async () => "OK"),
    };
    return client;
  }

  it("applies the first token before connecting, then re-AUTHs on refresh", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();
    const originalConnect = client.connect;

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );

    // Nothing is fetched or connected until a caller triggers connect().
    expect(client.options.password).toBeUndefined();
    expect(originalConnect).not.toHaveBeenCalled();

    await client.connect();
    // The token is applied before the wrapped connect runs.
    expect(client.options.password).toBe("token-1");
    expect(client.options.username).toBe("object-id-123");
    expect(originalConnect).toHaveBeenCalledTimes(1);
    expect(client.call).not.toHaveBeenCalled();

    // On refresh: options updated AND a live AUTH issued (no reconnect).
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8);
    expect(client.options.password).toBe("token-2");
    expect(client.call).toHaveBeenCalledWith(
      "AUTH",
      "object-id-123",
      "token-2",
    );
    manager.stop();
  });

  it("rejects connect when the first token fetch fails, and retries on the next connect", async () => {
    const provider = fakeProvider();
    (provider.fetchToken as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("token endpoint unavailable"),
    );
    const client = fakeRedisClient();
    const originalConnect = client.connect;

    const manager = bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );

    await expect(client.connect()).rejects.toThrow(/token endpoint/);
    expect(originalConnect).not.toHaveBeenCalled();

    // Bootstrap reset on failure, so a later connect retries the fetch.
    await client.connect();
    expect(client.options.password).toBe("token-1");
    expect(originalConnect).toHaveBeenCalledTimes(1);
    manager.stop();
  });
});

describe("getRedisManagedCredentialProviderFromEnv", () => {
  it("returns null for the default static method (backward compatible)", () => {
    envMock.env.REDIS_AUTH_METHOD = "static";
    expect(getRedisManagedCredentialProviderFromEnv()).toBeNull();
  });

  it("builds an Azure provider with the object-id username and scope default", () => {
    envMock.env.REDIS_AUTH_METHOD = "azure_managed_identity";
    envMock.env.REDIS_USERNAME = "object-id-xyz";
    const provider = getRedisManagedCredentialProviderFromEnv();
    expect(provider).toBeInstanceOf(AzureManagedIdentityCredentialProvider);
    expect(provider?.name).toBe("azure_managed_identity");
    expect(provider?.username).toBe("object-id-xyz");
  });
});
