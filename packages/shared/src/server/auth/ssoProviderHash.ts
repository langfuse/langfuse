import * as crypto from "crypto";

const HASH_LENGTH = 12;

/**
 * Generates a deterministic, non-reversible callback URL ID for SSO configurations.
 * Uses SHA-256 hash of domain + authProvider to create an 12-character identifier.
 *
 * @param params.domain - The SSO domain (e.g., "example.com")
 * @param params.authProvider - The auth provider type (e.g., "okta", "auth0")
 * @returns An 12-character hex string (e.g., "a1b2c3d41234")
 */
export function generateSsoCallbackUrlId(params: {
  domain: string;
  authProvider: string;
}): string {
  const input = `${params.domain.toLowerCase()}.${params.authProvider}`;
  const hash = crypto.createHash("sha256").update(input, "utf8").digest("hex");
  return hash.substring(0, HASH_LENGTH);
}
