import type { Redis } from "ioredis";
import { env } from "../../../env";
import { logger } from "../../logger";
import { AzureManagedIdentityCredentialProvider } from "./azureManagedIdentity";
import { RefreshingTokenManager } from "./RefreshingTokenManager";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

type BoundConnection = {
  client: Redis;
  provider: ManagedCredentialProvider;
};

// One provider, manager and token per process: Langfuse opens a connection per
// queue plus the cache singleton and rate limiters, and a credential each would
// mean dozens of refresh loops against a token endpoint that throttles.
let sharedProvider: ManagedCredentialProvider | null | undefined;
let sharedManager: RefreshingTokenManager | null = null;
let startPromise: Promise<ManagedAccessToken> | null = null;
let currentToken: ManagedAccessToken | null = null;
const boundConnections = new Set<BoundConnection>();

// Returns null for the default static auth, leaving the existing path unchanged.
export function getRedisManagedCredentialProviderFromEnv(): ManagedCredentialProvider | null {
  if (sharedProvider !== undefined) return sharedProvider;

  switch (env.REDIS_AUTH_METHOD) {
    case "azure_managed_identity":
      sharedProvider = new AzureManagedIdentityCredentialProvider({
        scope: env.REDIS_AZURE_SCOPE,
        username: env.REDIS_USERNAME ?? undefined,
        clientId: env.REDIS_AZURE_CLIENT_ID ?? undefined,
      });
      break;
    case "static":
    default:
      sharedProvider = null;
  }

  return sharedProvider;
}

// ioredis attaches the failed command -- including the credential it just sent --
// to reply errors, and the logger serialises an Error's own enumerable properties.
// Rendering only the message keeps a rotation failure from emitting a replayable
// bearer token into the logs.
const describeError = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

// ioredis builds its auth handshake from options.password inside connect(), so
// this is what every connect and reconnect authenticates from.
function applyToken(entry: BoundConnection, token: ManagedAccessToken): void {
  entry.client.options.password = token.token;
  if (entry.provider.username) {
    entry.client.options.username = entry.provider.username;
  }
}

function reauthenticate(
  entry: BoundConnection,
  token: ManagedAccessToken,
): void {
  // Only an open socket needs AUTH; anything else picks the password up from its
  // options on the next connect, and commanding it here would force a connection.
  if (entry.client.status !== "ready") return;

  const authArgs = entry.provider.username
    ? [entry.provider.username, token.token]
    : [token.token];

  entry.client
    .call("AUTH", ...authArgs)
    .catch((error) =>
      logger.warn(
        `Failed to re-authenticate Redis after ${entry.provider.name} token refresh: ${describeError(error)}`,
      ),
    );
}

function distributeToken(token: ManagedAccessToken): void {
  currentToken = token;
  for (const entry of boundConnections) {
    applyToken(entry, token);
    reauthenticate(entry, token);
  }
}

function getSharedManager(
  provider: ManagedCredentialProvider,
): RefreshingTokenManager {
  if (!sharedManager) {
    sharedManager = new RefreshingTokenManager(provider);
    sharedManager.onRefresh(distributeToken);
  }
  return sharedManager;
}

function ensureTokenStarted(
  provider: ManagedCredentialProvider,
): Promise<ManagedAccessToken> {
  const manager = getSharedManager(provider);

  startPromise ??= manager
    .start()
    .then((token) => {
      // start() arms the refresh timer but does not notify subscribers.
      distributeToken(token);
      return token;
    })
    .catch((error) => {
      startPromise = null; // let a later connection retry the fetch
      throw error;
    });

  return startPromise;
}

/**
 * Acquires the first managed credential before anything connects.
 *
 * Required for the managed path, not merely an optimisation: ioredis does not retry
 * a rejected AUTH handshake -- retryStrategy covers socket failures, not a
 * protocol-level rejection -- so a connection that outruns the first token is closed
 * for good rather than recovered. Clients are created with `lazyConnect`, so
 * awaiting this during startup, before queues, workers or the first request, is what
 * guarantees a token is in hand by the time anything opens a socket.
 *
 * No-op for static auth, and safe to call more than once.
 */
export const initializeRedisManagedCredentials = async (): Promise<void> => {
  const provider = getRedisManagedCredentialProviderFromEnv();
  if (!provider) return;

  await ensureTokenStarted(provider);
};

/** Test seam: clears process-wide state so a suite can switch REDIS_AUTH_METHOD. */
export const resetRedisManagedCredentialsForTests = (): void => {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "resetRedisManagedCredentialsForTests must not be called in production: it stops rotation and unbinds every connection.",
    );
  }

  sharedManager?.stop();
  sharedProvider = undefined;
  sharedManager = null;
  startPromise = null;
  currentToken = null;
  boundConnections.clear();
};

/**
 * Keeps a Redis connection authenticated as the managed credential rotates.
 *
 * `connect()` is deliberately left untouched: ioredis assigns its auth condition
 * synchronously inside `connect()` and reads it back in the same tick when queueing
 * a command, so wrapping it to await a token breaks command-triggered auto-connect,
 * the path BullMQ uses. The token is written to options instead, which is what both
 * the first connect and every reconnect authenticate from -- so a credential has to
 * be in hand before anything connects. See initializeRedisManagedCredentials().
 */
export function bindManagedCredentialToRedis(
  client: Redis,
  provider: ManagedCredentialProvider,
  deps: { manager?: RefreshingTokenManager } = {},
): RefreshingTokenManager {
  const manager = deps.manager ?? getSharedManager(provider);
  const entry: BoundConnection = { client, provider };

  boundConnections.add(entry);
  if (currentToken) applyToken(entry, currentToken);
  // ioredis emits "end" when it will not retry on its own, but BullMQ revives the
  // same instance through RedisConnection.reconnect(). Re-registering on connect
  // keeps a revived client in rotation instead of silently leaving it on a frozen
  // credential until the next expiry kills it.
  client.on("end", () => boundConnections.delete(entry));
  client.on("connect", () => {
    boundConnections.add(entry);
    if (currentToken) applyToken(entry, currentToken);
  });

  // BullMQ's Worker does not use the connection it is handed -- it builds its
  // blocking connection with duplicate(), which ioredis implements as
  // `new Redis({ ...this.options })`. That copy inherits no tracking and a frozen
  // password, so unbound it authenticates once and dies at the first expiry while
  // producers keep enqueuing successfully.
  const duplicate = client.duplicate.bind(client);
  client.duplicate = ((...args: Parameters<Redis["duplicate"]>) => {
    const copy = duplicate(...args);
    bindManagedCredentialToRedis(copy, provider, { manager });
    return copy;
  }) as Redis["duplicate"];

  // Not awaited: createNewRedisInstance is synchronous. Deduplicated across every
  // connection the process opens.
  ensureTokenStarted(provider).catch((error) =>
    logger.error(
      `Failed to fetch initial ${provider.name} token for Redis: ${describeError(error)}`,
    ),
  );

  return manager;
}
