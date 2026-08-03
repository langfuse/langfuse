import { type SsoProviderSchema } from "@/src/ee/features/multi-tenant-sso/types";
import {
  fetchWithSecureRedirects,
  validateWebhookURL,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";
import { TRPCError } from "@trpc/server";

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

// Returns the issuer URL to hit `.well-known/openid-configuration` against, or
// null when the provider doesn't speak OIDC discovery (the GitHub family is
// OAuth2-only — we have no way to validate at save time, the misconfiguration
// surfaces on first sign-in attempt).
function discoveryIssuerFor(payload: SsoProviderSchema): string | null {
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
    default:
      return null;
  }
}

const stripTrailingSlash = (url: string) => url.replace(/\/$/, "");

// Microsoft's documented multi-tenant tenantId values. Discovery for these
// returns `issuer` with the literal `{tenantid}` placeholder string instead
// of the configured tenantId — the actual tenant is bound at token-issuance
// time per user's home tenant. NextAuth's AzureADProvider handles this at
// sign-in, so save-time we compare against the placeholder rather than the
// configured value to avoid blocking legitimate multi-tenant configurations.
const AZURE_AD_MULTI_TENANT = new Set(["common", "organizations", "consumers"]);
const AZURE_AD_TENANT_PLACEHOLDER = "{tenantid}";

function expectedReturnedIssuer(
  payload: SsoProviderSchema,
  trimmedIssuer: string,
): string {
  if (
    payload.authProvider === "azure-ad" &&
    payload.authConfig &&
    AZURE_AD_MULTI_TENANT.has(payload.authConfig.tenantId)
  ) {
    return trimmedIssuer.replace(
      `/${payload.authConfig.tenantId}/`,
      `/${AZURE_AD_TENANT_PLACEHOLDER}/`,
    );
  }
  return trimmedIssuer;
}

// Pre-flight check that the IdP's OIDC discovery document is reachable, well
// formed, and reports the issuer we configured. Catches gross misconfigurations
// (wrong issuer URL, unreachable IdP, mistyped tenant id) at save time instead
// of locking out users at first sign-in. OAuth-only providers (GitHub family)
// skip silently since they have no `.well-known` endpoint.
export async function validateSsoConfig(
  payload: SsoProviderSchema,
): Promise<void> {
  const issuer = discoveryIssuerFor(payload);
  if (!issuer) return;

  const trimmedIssuer = stripTrailingSlash(issuer);
  const discoveryUrl = `${trimmedIssuer}/.well-known/openid-configuration`;

  // Ports unrestricted: self-hosted IdPs use 8443.
  const whitelist = whitelistFromEnv();
  const validateUrl = (url: string) =>
    validateWebhookURL(url, whitelist, { allowedPorts: "any" });

  let resp: Response;
  try {
    // Inside this try so a blocked host is indistinguishable from an
    // unreachable one.
    await validateUrl(discoveryUrl);

    // maxRedirects 0 rejects any 3xx; OIDC Discovery §4 serves the doc
    // directly at the issuer URL. fetchWithSecureRedirects also re-validates
    // the peer IP at connect time, closing the DNS-rebind window above.
    const { response } = await fetchWithSecureRedirects(
      discoveryUrl,
      { signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS) },
      {
        maxRedirects: 0,
        redirectValidation: {
          validateUrl,
          whitelist,
          logContext: "SSO discovery URL",
        },
      },
    );
    resp = response;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Could not reach ${discoveryUrl}. Verify the issuer URL is correct and reachable from the public internet.`,
    });
  }

  if (!resp.ok) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `OIDC discovery at ${discoveryUrl} returned ${resp.status}. Verify the issuer URL is correct.`,
    });
  }

  let doc: DiscoveryDoc;
  try {
    doc = (await resp.json()) as DiscoveryDoc;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `OIDC discovery at ${discoveryUrl} did not return valid JSON.`,
    });
  }

  const missing = REQUIRED_DISCOVERY_FIELDS.filter(
    (k) => typeof doc[k] !== "string",
  );
  if (missing.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `OIDC discovery at ${discoveryUrl} is missing required field(s): ${missing.join(", ")}.`,
    });
  }

  // Per OIDC Discovery §3, the discovery doc's `issuer` must match the URL we
  // used to fetch it. Trim trailing slashes on both sides — Auth0 and friends
  // typically serve the issuer with a trailing `/` even if users don't enter it.
  // Azure AD multi-tenant endpoints return `{tenantid}` as a literal
  // placeholder; map our expected issuer to the same shape before comparing.
  const returnedIssuer = stripTrailingSlash(doc.issuer as string);
  const expectedIssuer = expectedReturnedIssuer(payload, trimmedIssuer);
  if (returnedIssuer !== expectedIssuer) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `OIDC discovery at ${discoveryUrl} reported issuer "${doc.issuer as string}" but we expected "${expectedIssuer}". Check the issuer URL matches exactly.`,
    });
  }
}
