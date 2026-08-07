import { TRPCError } from "@trpc/server";

import {
  fetchWithSecureRedirects,
  validateWebhookURL,
} from "@langfuse/shared/src/server";
import { env } from "@langfuse/shared/src/env";
import { type SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";

const DISCOVERY_TIMEOUT_MS = 5000;

type DiscoveryDoc = {
  authorization_endpoint?: unknown;
  token_endpoint?: unknown;
  jwks_uri?: unknown;
  issuer?: unknown;
};

const REQUIRED_DISCOVERY_FIELDS = [
  "authorization_endpoint",
  "token_endpoint",
  "jwks_uri",
  "issuer",
] as const;

/** getDiscoveryIssuer returns the provider's configured issuer URL, or null when the provider has no OIDC discovery (GitHub family is OAuth2-only — misconfiguration surfaces at first sign-in). */
function getDiscoveryIssuer(payload: SsoProviderSchema): string | null {
  switch (payload.authProvider) {
    case "github":
    case "github-enterprise":
      return null;
    case "google":
      return "https://accounts.google.com";
    case "azure-ad":
      return payload.authConfig
        ? `https://login.microsoftonline.com/${payload.authConfig.tenantId}/v2.0`
        : null;
    case "gitlab":
      return payload.authConfig?.issuer ?? "https://gitlab.com";
    case "auth0":
    case "okta":
    case "authentik":
    case "onelogin":
    case "cognito":
    case "keycloak":
    case "jumpcloud":
    case "custom":
      return payload.authConfig?.issuer ?? null;
  }
}

const stripTrailingSlash = (url: string) => url.replace(/\/$/, "");

/** getDiscoveryUrl builds the discovery-document URL for issuer. */
function getDiscoveryUrl(issuer: string): string {
  return `${stripTrailingSlash(issuer)}/.well-known/openid-configuration`;
}

/** validateSsoConfig checks at save time that the IdP's OIDC discovery doc is reachable, well formed, and reports the configured issuer. */
export async function validateSsoConfig(
  payload: SsoProviderSchema,
): Promise<void> {
  const issuer = getDiscoveryIssuer(payload);
  if (!issuer) return;

  const discoveryUrl = getDiscoveryUrl(issuer);

  try {
    const resp = await fetchWithSsrfDefense(discoveryUrl);
    const doc = await parseJson<DiscoveryDoc>(resp);
    validateDiscoveryFields(doc);
    validateDiscoveryIssuer(doc, payload, issuer);
  } catch (error) {
    if (error instanceof TRPCError)
      throw prefixError(`OIDC discovery at ${discoveryUrl}: `, error);
    throw error;
  }
}

/** fetchWithSsrfDefense fetches url with internal-address blocking and the operator whitelist applied. */
async function fetchWithSsrfDefense(url: string): Promise<Response> {
  try {
    const whitelist = discoveryWhitelistFromEnv();
    // any port: NextAuth's sign-in fetch has no port restriction
    await validateWebhookURL(url, whitelist, { allowedPorts: "any" });
    const result = await fetchWithSecureRedirects(
      url,
      { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) },
      {
        maxRedirects: 0, // OIDC Discovery §4: doc is served directly at the issuer URL
        redirectValidation: {
          validateUrl: validateWebhookURL,
          whitelist,
        },
      },
    );
    return result.response;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "could not reach the URL. Verify the issuer URL is correct and reachable from the public internet.",
    });
  }
}

/** parseJson parses a 2xx response body as JSON, throwing on non-2xx status or invalid JSON. */
async function parseJson<T = unknown>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `returned ${response.status}. Verify the issuer URL is correct.`,
    });
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "did not return valid JSON.",
    });
  }
}

/** validateDiscoveryFields checks the doc has the required OIDC discovery fields. */
function validateDiscoveryFields(doc: DiscoveryDoc): void {
  const missing = REQUIRED_DISCOVERY_FIELDS.filter(
    (k) => typeof doc[k] !== "string",
  );
  if (missing.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `missing required field(s): ${missing.join(", ")}.`,
    });
  }
}

/** validateDiscoveryIssuer checks the doc reports the configured issuer. */
function validateDiscoveryIssuer(
  doc: DiscoveryDoc,
  payload: SsoProviderSchema,
  issuer: string,
): void {
  // Azure multi-tenant endpoints report the literal `{tenantid}` placeholder
  // as issuer — the tenant is bound at sign-in.
  const azureMultiTenantIds = ["common", "organizations", "consumers"];
  const expectedIssuer =
    payload.authProvider === "azure-ad" &&
    payload.authConfig &&
    azureMultiTenantIds.includes(payload.authConfig.tenantId)
      ? stripTrailingSlash(issuer).replace(
          `/${payload.authConfig.tenantId}/`,
          "/{tenantid}/",
        )
      : stripTrailingSlash(issuer);

  // OIDC Discovery §3: the doc's issuer must match the URL it was fetched from.
  // Trailing slashes trimmed on both sides — Auth0 and friends serve one.
  const returnedIssuer = stripTrailingSlash(doc.issuer as string);
  if (returnedIssuer !== expectedIssuer) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `reported issuer "${doc.issuer as string}" but we expected "${expectedIssuer}". Check the issuer URL matches exactly.`,
    });
  }
}

/** prefixError returns a copy of error with prefix prepended to its message. */
function prefixError(prefix: string, error: TRPCError): TRPCError {
  return new TRPCError({
    code: error.code,
    message: `${prefix}${error.message}`,
  });
}

/** discoveryWhitelistFromEnv builds the operator-configured exemptions to the internal-address blocklist. */
function discoveryWhitelistFromEnv() {
  return {
    hosts: env.LANGFUSE_SSO_DISCOVERY_WHITELISTED_HOST || [],
    ips: env.LANGFUSE_SSO_DISCOVERY_WHITELISTED_IPS || [],
    ip_ranges: env.LANGFUSE_SSO_DISCOVERY_WHITELISTED_IP_SEGMENTS || [],
  };
}
