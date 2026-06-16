// Type-only import: erased at compile time, so `@azure/identity` is NOT loaded
// unless a deployment actually selects the azure-managed-identity method. The
// concrete credential classes are pulled in lazily in `getCredential()` below.
import type { TokenCredential } from "@azure/identity";
import type { ManagedAccessToken, ManagedCredentialProvider } from "../types";

/** Microsoft Entra scope for Azure Cache for Redis / Azure Managed Redis. */
export const AZURE_REDIS_SCOPE = "https://redis.azure.com/.default";
/** Microsoft Entra scope for Azure Database for PostgreSQL (flexible server). */
export const AZURE_POSTGRES_SCOPE =
  "https://ossrdbms-aad.database.windows.net/.default";

export interface AzureManagedIdentityProviderOptions {
  /** The Entra scope/resource to request a token for (see scope constants). */
  scope: string;
  /**
   * Principal presented as the username. For Azure Cache for Redis this is the
   * object id of the managed identity / service principal.
   */
  username?: string;
  /**
   * Client id of a *user-assigned* managed identity. Omit for system-assigned
   * identity, where `DefaultAzureCredential` is used (which also covers Workload
   * Identity Federation on AKS, env-based service principals, and `az login`).
   */
  clientId?: string;
  /**
   * Inject a pre-built credential. Primarily for tests; also lets callers supply
   * a more specific `@azure/identity` credential when the defaults don't fit.
   */
  credential?: TokenCredential;
}

/**
 * Mints short-lived Microsoft Entra access tokens via `@azure/identity`.
 *
 * `@azure/identity` is imported lazily so the SDK is only loaded when this
 * provider is actually constructed and used. If the optional dependency is not
 * installed, a clear, actionable error is thrown.
 */
export class AzureManagedIdentityCredentialProvider implements ManagedCredentialProvider {
  public readonly name = "azure-managed-identity";
  public readonly username?: string;
  private readonly scope: string;
  private readonly clientId?: string;
  private credentialPromise?: Promise<TokenCredential>;

  constructor(options: AzureManagedIdentityProviderOptions) {
    this.scope = options.scope;
    this.username = options.username;
    this.clientId = options.clientId;
    if (options.credential) {
      this.credentialPromise = Promise.resolve(options.credential);
    }
  }

  private async getCredential(): Promise<TokenCredential> {
    if (!this.credentialPromise) {
      this.credentialPromise = import("@azure/identity")
        .then(({ DefaultAzureCredential, ManagedIdentityCredential }) =>
          this.clientId
            ? new ManagedIdentityCredential({ clientId: this.clientId })
            : new DefaultAzureCredential(),
        )
        .catch((error) => {
          this.credentialPromise = undefined;
          throw new Error(
            "Failed to load '@azure/identity'. Install it to use the " +
              "azure-managed-identity credential method.",
            { cause: error },
          );
        });
    }
    return this.credentialPromise;
  }

  public async fetchToken(): Promise<ManagedAccessToken> {
    const credential = await this.getCredential();
    const token = await credential.getToken(this.scope);
    if (!token) {
      throw new Error(
        `Azure managed identity returned no token for scope "${this.scope}"`,
      );
    }
    return {
      token: token.token,
      expiresOnTimestamp: token.expiresOnTimestamp,
    };
  }
}
