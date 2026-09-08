import {
  DefaultAzureCredential,
  ManagedIdentityCredential,
  type TokenCredential,
} from "@azure/identity";
import type { ManagedAccessToken, ManagedCredentialProvider } from "./types";

export const AZURE_REDIS_SCOPE = "https://redis.azure.com/.default";

export interface AzureManagedIdentityProviderOptions {
  scope: string;
  username?: string;
  clientId?: string;
  credential?: TokenCredential;
}

export class AzureManagedIdentityCredentialProvider implements ManagedCredentialProvider {
  public readonly name = "azure_managed_identity";
  public readonly username?: string;
  private readonly scope: string;
  private readonly credential: TokenCredential;

  constructor(options: AzureManagedIdentityProviderOptions) {
    this.scope = options.scope;
    this.username = options.username;
    this.credential =
      options.credential ??
      (options.clientId
        ? new ManagedIdentityCredential({ clientId: options.clientId })
        : new DefaultAzureCredential());
  }

  public async fetchToken(): Promise<ManagedAccessToken> {
    const token = await this.credential.getToken(this.scope);
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
