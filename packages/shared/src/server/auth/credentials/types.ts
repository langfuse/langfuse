/**
 * Generic, provider-agnostic contracts for short-lived ("managed") credentials.
 *
 * The goal is a single seam that works across cloud identity backends (Azure
 * Managed Identity / Entra ID today; AWS IAM and GCP Workload Identity next) and
 * across infrastructure dependencies (Redis today; Postgres next). A provider
 * only knows how to mint a fresh access token; the {@link RefreshingTokenManager}
 * owns caching and refresh-ahead; consumers (Redis, Postgres) own the wiring.
 *
 * This mirrors the layering used by the official Redis `@redis/entraid` package
 * (IdentityProvider -> TokenManager -> CredentialsProvider) and Grafana's
 * per-cloud "auth type -> factory -> provider" pattern.
 */

/**
 * A short-lived access token that is presented as the password to an
 * infrastructure dependency. Intentionally minimal so every cloud provider can
 * map onto it (the shape matches `@azure/identity`'s `AccessToken`).
 */
export interface ManagedAccessToken {
  /** The opaque token string used as the password / AUTH secret. */
  token: string;
  /** Absolute expiry, in milliseconds since the Unix epoch. */
  expiresOnTimestamp: number;
}

/**
 * A source of short-lived credentials for a single cloud identity backend.
 *
 * Implementations must be cheap to construct and side-effect free until
 * {@link fetchToken} is called, so that selecting a provider never forces the
 * underlying cloud SDK to load for deployments that don't use it.
 */
export interface ManagedCredentialProvider {
  /** Stable identifier used in logs and metrics, e.g. "azure-managed-identity". */
  readonly name: string;
  /**
   * The username / principal to present alongside the token, when the resource
   * requires one. For Azure Cache for Redis this is the identity's object id.
   * Undefined when the resource derives the principal from the token itself.
   */
  readonly username?: string;
  /** Fetch a fresh access token from the identity backend. */
  fetchToken(): Promise<ManagedAccessToken>;
}

/**
 * Supported short-lived credential methods. "static" (the default everywhere)
 * preserves the existing username/password behaviour and is handled by simply
 * not constructing a provider. New backends extend this union.
 */
export type ManagedCredentialAuthMethod = "static" | "azure-managed-identity";
// Planned: "aws-iam" | "gcp-workload-identity"
