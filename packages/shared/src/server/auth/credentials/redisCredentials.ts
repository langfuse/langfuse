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
 * Build the Redis credential provider from env, or null for the default static
 * username/password auth (which leaves the existing behaviour unchanged).
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
 * Wire a credential provider into an ioredis client. ioredis v5 has no native
 * credentials hook, so on each refresh we update options.password (for future
 * reconnects) and issue a live AUTH on the open connection. The caller creates
 * the client with lazyConnect so the first token is installed before connecting.
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
