import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Redis } from "ioredis";

// --- Mocks ---------------------------------------------------------------
// Mock @azure/identity so the test never touches Azure or the network.
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

// Mutable env so we can drive getRedisManagedCredentialProviderFromEnv().
const envMock = vi.hoisted(() => ({
  env: {
    REDIS_AUTH_METHOD: "static" as "static" | "azure-managed-identity" | "file",
    REDIS_USERNAME: undefined as string | undefined | null,
    REDIS_AZURE_CLIENT_ID: undefined as string | undefined,
    REDIS_AZURE_SCOPE: undefined as string | undefined,
    REDIS_AUTH_FILE: undefined as string | undefined,
  },
}));
vi.mock("../../../env", () => envMock);

// Logger is noise here — silence it and avoid loading the real env via logger.
vi.mock("../../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  AZURE_REDIS_SCOPE,
  AzureManagedIdentityCredentialProvider,
} from "./providers/azureManagedIdentity";
import { FileCredentialProvider } from "./providers/fileCredential";
import { RefreshingTokenManager } from "./RefreshingTokenManager";
import {
  bindManagedCredentialToRedis,
  getRedisManagedCredentialProviderFromEnv,
} from "./redisCredentials";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

const ONE_HOUR = 60 * 60 * 1000;

/** A controllable provider for exercising the generic, provider-agnostic core. */
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
  envMock.env.REDIS_AUTH_FILE = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FileCredentialProvider (generic, zero-dependency)", () => {
  it("reads the token from a file and re-reads on rotation", async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "lf-cred-")),
      "token",
    );
    fs.writeFileSync(file, "secret-one\n");

    const provider = new FileCredentialProvider({
      path: file,
      username: "svc",
    });
    const first = await provider.fetchToken();
    expect(first.token).toBe("secret-one");
    expect(provider.username).toBe("svc");
    expect(first.expiresOnTimestamp).toBeGreaterThan(Date.now());

    // An external rotator updates the file; the next fetch picks it up.
    fs.writeFileSync(file, "secret-two");
    expect((await provider.fetchToken()).token).toBe("secret-two");
  });

  it("throws on an empty credential file", async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "lf-cred-")),
      "token",
    );
    fs.writeFileSync(file, "   \n");
    const provider = new FileCredentialProvider({ path: file });
    await expect(provider.fetchToken()).rejects.toThrow(/empty/);
  });
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
    expect(provider.name).toBe("azure-managed-identity");
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

describe("RefreshingTokenManager (generic refresh-ahead)", () => {
  it("caches a valid token and single-flights concurrent fetches", async () => {
    const provider = fakeProvider();
    const manager = new RefreshingTokenManager(provider);

    const [a, b] = await Promise.all([manager.getToken(), manager.getToken()]);

    expect(a.token).toBe("token-1");
    expect(b.token).toBe("token-1");
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    // Cached while still valid.
    expect((await manager.getToken()).token).toBe("token-1");
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

    const first = await manager.start();
    expect(first.token).toBe("token-1");
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    // Nothing yet just before the refresh-ahead point.
    await vi.advanceTimersByTimeAsync(ONE_HOUR * 0.8 - 1000);
    expect(provider.fetchToken).toHaveBeenCalledTimes(1);

    // Crossing 80% of the lifetime triggers a background refresh.
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

  it("installs the first token, connects, and re-AUTHs on refresh", async () => {
    vi.useFakeTimers();
    const provider = fakeProvider({ username: "object-id-123" });
    const client = fakeRedisClient();

    const manager = await bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );

    // First token is installed before connecting.
    expect(client.options.password).toBe("token-1");
    expect(client.options.username).toBe("object-id-123");
    expect(client.connect).toHaveBeenCalledTimes(1);
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

  it("does not connect if the client already left the 'wait' state", async () => {
    const provider = fakeProvider();
    const client = fakeRedisClient();
    client.status = "ready"; // a command already triggered auto-connect

    const manager = await bindManagedCredentialToRedis(
      client as unknown as Redis,
      provider,
    );
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.options.password).toBe("token-1");
    manager.stop();
  });
});

describe("getRedisManagedCredentialProviderFromEnv", () => {
  it("returns null for the default static method (backward compatible)", () => {
    envMock.env.REDIS_AUTH_METHOD = "static";
    expect(getRedisManagedCredentialProviderFromEnv()).toBeNull();
  });

  it("builds an Azure provider with the object-id username and scope default", () => {
    envMock.env.REDIS_AUTH_METHOD = "azure-managed-identity";
    envMock.env.REDIS_USERNAME = "object-id-xyz";
    const provider = getRedisManagedCredentialProviderFromEnv();
    expect(provider).toBeInstanceOf(AzureManagedIdentityCredentialProvider);
    expect(provider?.name).toBe("azure-managed-identity");
    expect(provider?.username).toBe("object-id-xyz");
  });

  it("builds a file provider when REDIS_AUTH_FILE is set", () => {
    envMock.env.REDIS_AUTH_METHOD = "file";
    envMock.env.REDIS_AUTH_FILE = "/var/run/secrets/redis-token";
    const provider = getRedisManagedCredentialProviderFromEnv();
    expect(provider).toBeInstanceOf(FileCredentialProvider);
    expect(provider?.name).toBe("file");
  });

  it("falls back to static when file method is missing the file path", () => {
    envMock.env.REDIS_AUTH_METHOD = "file";
    envMock.env.REDIS_AUTH_FILE = undefined;
    expect(getRedisManagedCredentialProviderFromEnv()).toBeNull();
  });
});
