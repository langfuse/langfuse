export interface ManagedAccessToken {
  token: string;
  /** Absolute expiry, milliseconds since epoch. */
  expiresOnTimestamp: number;
}

/**
 * Source of short-lived credentials for one cloud identity backend. Must be
 * cheap to construct and side-effect free until fetchToken() is called.
 */
export interface ManagedCredentialProvider {
  readonly name: string;
  /** Principal presented alongside the token, e.g. the Azure identity object id. */
  readonly username?: string;
  fetchToken(): Promise<ManagedAccessToken>;
}

export type ManagedCredentialAuthMethod = "static" | "azure-managed-identity";
