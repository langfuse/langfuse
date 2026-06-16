import type { Redis } from "ioredis";
import { env } from "../../../env";
import { logger } from "../../logger";
import {
  AZURE_REDIS_SCOPE,
  AzureManagedIdentityCredentialProvider,
} from "./providers/azureManagedIdentity";
import { FileCredentialProvider } from "./providers/fileCredential";
import { RefreshingTokenManager } from "./RefreshingTokenManager";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

/**
 * Build the Redis credential provider from the environment, or `null` for the
 * default static username/password auth. Returning `null` is what keeps this
 * feature fully backward compatible — the existing code path is taken verbatim.
 */
export function getRedisManagedCredentialProviderFromEnv(): ManagedCredentialProvider | null {
  switch (env.REDIS_AUTH_METHOD) {
    case "azure-managed-identity":
      return new AzureManagedIdentityCredentialProvider({
        scope: env.REDIS_AZURE_SCOPE ?? AZURE_REDIS_SCOPE,
        // For Azure Cache for Redis the username is the identity's object id.
        username: env.REDIS_USERNAME ?? undefined,
        clientId: env.REDIS_AZURE_CLIENT_ID ?? undefined,
      });
    case "file":
      if (!env.REDIS_AUTH_FILE) {
        logger.error(
          "REDIS_AUTH_METHOD=file requires REDIS_AUTH_FILE to be set; falling back to static auth",
        );
        return null;
      }
      return new FileCredentialProvider({
        path: env.REDIS_AUTH_FILE,
        username: env.REDIS_USERNAME ?? undefined,
      });
    case "static":
    default:
      return null;
  }
}

/**
 * Wire a short-lived credential provider into an ioredis client.
 *
 * ioredis (v5) has no native credentials-provider hook, so we drive it
 * externally — the documented pattern for Azure Entra / ElastiCache IAM:
 *  1. Fetch the first token and set it as `options.password` before connecting.
 *  2. On every refresh, update `options.password` (so future reconnects use the
 *     fresh token) AND issue a live `AUTH` so the open connection re-authenticates
 *     without dropping.
 *
 * The client is created with `lazyConnect: true` by the caller so we can install
 * the first token before the socket opens.
 */
export async function bindManagedCredentialToRedis(
  client: Redis,
  provider: ManagedCredentialProvider,
  deps: { manager?: RefreshingTokenManager } = {},
): Promise<RefreshingTokenManager> {
  const manager = deps.manager ?? new RefreshingTokenManager(provider);

  const applyToken = (token: ManagedAccessToken) => {
    client.options.password = token.token;
    if (provider.username) client.options.username = provider.username;
  };

  // Install the first token before connecting.
  const initial = await manager.start();
  applyToken(initial);

  // Refresh-ahead: update options for future reconnects and re-AUTH live.
  manager.onRefresh((token) => {
    applyToken(token);
    const authArgs = provider.username
      ? [provider.username, token.token]
      : [token.token];
    Promise.resolve(client.call("AUTH", ...authArgs)).catch((error) =>
      logger.warn(
        `Failed to re-authenticate Redis after ${provider.name} token refresh`,
        error,
      ),
    );
  });

  // Open the connection now that the credential is in place. If a command beat
  // us and already triggered auto-connect, ioredis is past "wait" and the live
  // AUTH above keeps it authenticated.
  if (client.status === "wait") {
    await client
      .connect()
      .catch((error) =>
        logger.warn(
          `Redis connect after ${provider.name} credential bootstrap failed`,
          error,
        ),
      );
  }

  logger.info(
    `Initialized Redis connection with ${provider.name} short-lived credentials`,
  );
  return manager;
}
