const oneLoginOidcPath = "/oidc/2";

/**
 * resolveOneLoginIssuer returns the OIDC issuer for a configured OneLogin URL.
 * A URL ending in `/oidc/2` (`https://acme.onelogin.com/oidc/2`) is already the
 * issuer; anything else (`https://acme.onelogin.com`) gets `/oidc/2` appended,
 * matching NextAuth's OneLogin provider. The trailing slash is removed.
 */
export function resolveOneLoginIssuer(configured: string): string {
  const base = stripTrailingSlash(configured);
  return base.endsWith(oneLoginOidcPath) ? base : `${base}${oneLoginOidcPath}`;
}

/** getDiscoveryUrl builds the discovery-document URL for issuer. */
export function getDiscoveryUrl(issuer: string): string {
  return `${stripTrailingSlash(issuer)}/.well-known/openid-configuration`;
}

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}
