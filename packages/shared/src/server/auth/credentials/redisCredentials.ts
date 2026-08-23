import type { Redis } from "ioredis";
import { env } from "../../../env";
import { logger } from "../../logger";
import { AzureManagedIdentityCredentialProvider } from "./azureManagedIdentity";
import {
  describeError,
  RefreshingTokenManager,
} from "./RefreshingTokenManager";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

type BoundConnection = {
  client: Redis;
  provider: ManagedCredentialProvider;
};

// One provider, manager and token per process: a credential per connection would
// mean dozens of refresh loops against a token endpoint that throttles.
let sharedProvider: ManagedCredentialProvider | null | undefined;
let sharedManager: RefreshingTokenManager | null = null;
let startPromise: Promise<ManagedAccessToken> | null = null;
let currentToken: ManagedAccessToken | null = null;
const boundConnections = new Set<BoundConnection>();

// Retrying a transiently failed re-AUTH rotates the credential without waiting
// for the server to drop the connection at expiry.
const REAUTH_MAX_ATTEMPTS = 3;
const REAUTH_RETRY_DELAY_MS = 2_000;

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
  attempt = 1,
): void {
  // Only an open socket needs AUTH; anything else picks the password up from its
  // options on the next connect, and commanding it here would force a connection.
  if (entry.client.status !== "ready") return;

  // Re-authenticating with a superseded token would move the connection backwards.
  if (currentToken !== token) return;

  const authArgs = entry.provider.username
    ? [entry.provider.username, token.token]
    : [token.token];

  entry.client.call("AUTH", ...authArgs).catch((error) => {
    if (attempt < REAUTH_MAX_ATTEMPTS) {
      const retry = setTimeout(
        () => reauthenticate(entry, token, attempt + 1),
        REAUTH_RETRY_DELAY_MS,
      );
      retry.unref?.();
      return;
    }

    // Safe to give up: options.password already holds the new token, so the
    // connection the server drops at expiry reconnects with it.
    logger.warn(
      `Failed to re-authenticate Redis after ${entry.provider.name} token refresh, giving up after ${attempt} attempts: ${describeError(error)}`,
    );
  });
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
 * Required, not an optimisation: ioredis does not retry a rejected AUTH handshake,
 * so a connection that outruns the first token authenticates with an empty password
 * and fails until a reconnect succeeds. No-op for static auth, safe to call twice.
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

  // Never unregistered: ioredis snapshots the auth handshake inside connect(),
  // before it emits "connect", so a client revived by BullMQ's
  // RedisConnection.reconnect() needs its options already current. Keeping the
  // entry means rotation refreshes disconnected clients too.
  boundConnections.add(entry);
  if (currentToken) applyToken(entry, currentToken);

  // BullMQ's Worker builds its blocking connection with duplicate(), which ioredis
  // implements as `new Redis({ ...this.options })` -- a copy with no tracking and a
  // frozen password, which would die at the first expiry.
  const duplicate = client.duplicate.bind(client);
  client.duplicate = ((...args: Parameters<Redis["duplicate"]>) => {
    const copy = duplicate(...args);
    bindManagedCredentialToRedis(copy, provider, { manager });
    return copy;
  }) as Redis["duplicate"];

  // Not awaited: createNewRedisInstance is synchronous.
  ensureTokenStarted(provider).catch((error) =>
    logger.error(
      `Failed to fetch initial ${provider.name} token for Redis: ${describeError(error)}`,
    ),
  );

  return manager;
}
