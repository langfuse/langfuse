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

/** getDiscoveryIssuer returns the issuer the discovery doc should report, or null when the provider has no OIDC discovery (GitHub family is OAuth2-only — misconfiguration surfaces at first sign-in). */
function getDiscoveryIssuer(payload: SsoProviderSchema): string | null {
  switch (payload.authProvider) {
    case "github":
    case "github-enterprise":
      return null;
    case "google":
      return "https://accounts.google.com";
    case "azure-ad": {
      if (!payload.authConfig) return null;
      const tenant = AZURE_AD_MULTI_TENANT.has(payload.authConfig.tenantId)
        ? AZURE_AD_TENANT_PLACEHOLDER
        : payload.authConfig.tenantId;
      return `https://login.microsoftonline.com/${tenant}/v2.0`;
    }
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
    default:
      return null;
  }
}

const stripTrailingSlash = (url: string) => url.replace(/\/$/, "");

// Microsoft's documented multi-tenant tenantId values; discovery for these
// reports the literal `{tenantid}` placeholder — the tenant is bound at sign-in.
const AZURE_AD_MULTI_TENANT = new Set(["common", "organizations", "consumers"]);
const AZURE_AD_TENANT_PLACEHOLDER = "{tenantid}";

/** getDiscoveryUrl builds the discovery-document URL for issuer, substituting tenantId for the Azure placeholder. */
function getDiscoveryUrl(issuer: string, tenantId?: string): string {
  const trimmed = stripTrailingSlash(issuer);
  const resolved = tenantId
    ? trimmed.replace(AZURE_AD_TENANT_PLACEHOLDER, tenantId)
    : trimmed;
  return `${resolved}/.well-known/openid-configuration`;
}

// Pre-flight check that the IdP's OIDC discovery document is reachable, well
// formed, and reports the issuer we configured. Catches gross misconfigurations
// (wrong issuer URL, unreachable IdP, mistyped tenant id) at save time instead
// of locking out users at first sign-in. OAuth-only providers (GitHub family)
// skip silently since they have no `.well-known` endpoint.
export async function validateSsoConfig(
  payload: SsoProviderSchema,
): Promise<void> {
  const issuer = getDiscoveryIssuer(payload);
  if (!issuer) return;

  const tenantId =
    payload.authProvider === "azure-ad"
      ? payload.authConfig?.tenantId
      : undefined;
  const discoveryUrl = getDiscoveryUrl(issuer, tenantId);

  try {
    const resp = await fetchWithSsrfDefense(discoveryUrl);
    const doc = await parseJson<DiscoveryDoc>(resp);
    validateDiscoveryFields(doc);
    validateDiscoveryIssuer(doc, issuer);
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
function validateDiscoveryIssuer(doc: DiscoveryDoc, issuer: string): void {
  // OIDC Discovery §3: the doc's issuer must match the URL it was fetched from.
  // Trailing slashes trimmed on both sides — Auth0 and friends serve one.
  const expectedIssuer = stripTrailingSlash(issuer);
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
