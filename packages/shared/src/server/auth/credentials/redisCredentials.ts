import type { Redis } from "ioredis";
import { env } from "../../../env";
import { logger } from "../../logger";
import {
  AZURE_REDIS_SCOPE,
  AzureManagedIdentityCredentialProvider,
} from "./azureManagedIdentity";
import { RefreshingTokenManager } from "./RefreshingTokenManager";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

// Returns null for the default static auth, leaving the existing path unchanged.
export function getRedisManagedCredentialProviderFromEnv(): ManagedCredentialProvider | null {
  switch (env.REDIS_AUTH_METHOD) {
    case "azure_managed_identity":
      return new AzureManagedIdentityCredentialProvider({
        scope: env.REDIS_AZURE_SCOPE ?? AZURE_REDIS_SCOPE,
        username: env.REDIS_USERNAME ?? undefined,
        clientId: env.REDIS_AZURE_CLIENT_ID ?? undefined,
      });
    case "static":
    default:
      return null;
  }
}

// ioredis v5 has no credentials hook, so the binding wraps connect() to fetch
// and apply the first token before the socket opens, then issues a live AUTH on
// each later refresh and keeps options.password fresh for reconnects. The caller
// uses lazyConnect so nothing connects until this wrapper runs; ioredis routes
// both explicit connect() and command-triggered auto-connect through connect(),
// which closes the race with callers like BullMQ that connect on their own.
export function bindManagedCredentialToRedis(
  client: Redis,
  provider: ManagedCredentialProvider,
  deps: { manager?: RefreshingTokenManager } = {},
): RefreshingTokenManager {
  const manager = deps.manager ?? new RefreshingTokenManager(provider);

  const applyToken = (token: ManagedAccessToken) => {
    client.options.password = token.token;
    if (provider.username) client.options.username = provider.username;
  };

  manager.onRefresh((token) => {
    applyToken(token);
    const authArgs = provider.username
      ? [provider.username, token.token]
      : [token.token];
    client
      .call("AUTH", ...authArgs)
      .catch((error) =>
        logger.warn(
          `Failed to re-authenticate Redis after ${provider.name} token refresh`,
          error,
        ),
      );
  });

  const connect = client.connect.bind(client);
  let bootstrap: Promise<void> | null = null;
  client.connect = ((...args: Parameters<Redis["connect"]>) => {
    if (!bootstrap) {
      bootstrap = manager
        .start()
        .then(applyToken)
        .catch((error) => {
          bootstrap = null; // let the next connect attempt retry the token fetch
          logger.error(
            `Failed to fetch initial ${provider.name} token for Redis`,
            error,
          );
          throw error;
        });
    }
    return bootstrap.then(() => connect(...args));
  }) as Redis["connect"];

  return manager;
}
