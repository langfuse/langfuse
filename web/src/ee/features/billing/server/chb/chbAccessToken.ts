import { SpanKind, type Span } from "@opentelemetry/api";
import { z } from "zod";

import { instrumentAsync, logger } from "@langfuse/shared/src/server";

/**
 * Auth0 client-credentials (M2M) token source for the ClickHouse Billing (CHB)
 * REST API.
 */

export class ChbAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ChbAuthError";
  }
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  // Seconds.
  expires_in: z.number().positive(),
});

/**
 * Renew this long before the token actually expires, so a request that is
 * already in flight cannot arrive at CHB with a token that expired in transit.
 */
const EXPIRY_MARGIN_SECONDS = 300;

const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

export type ChbAccessTokenConfig = {
  /** Auth0 tenant hostname, without scheme (the token url is derived). */
  auth0Domain: string;
  clientId: string;
  clientSecret: string;
  audience: string;
};

/**
 * Tag the span with the issuer and audience of the token we just minted, so an
 * `Invalid or expired token` rejection from CHB can be attributed to a tenant
 * or audience mismatch without reproducing the request.
 *
 * Reads the claims without verifying the signature — this is a diagnostic on a
 * token we just received from Auth0 over TLS, never an authorization decision.
 * The token itself is never tagged or logged.
 */
const tagTokenClaims = (span: Span, accessToken: string): void => {
  const segments = accessToken.split(".");
  // An opaque token means the requested audience is not a registered Auth0
  // API, and CHB's JWT verifier will reject it on arrival.
  span.setAttribute(
    "chb.auth.token_format",
    segments.length === 3 ? "jwt" : "opaque",
  );
  if (segments.length !== 3) return;

  try {
    const claims = JSON.parse(
      Buffer.from(segments[1]!, "base64url").toString("utf8"),
    ) as { iss?: unknown; aud?: unknown };
    if (typeof claims.iss === "string") {
      span.setAttribute("chb.auth.token_issuer", claims.iss);
    }
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const audienceStrings = audience.filter(
      (entry): entry is string => typeof entry === "string",
    );
    if (audienceStrings.length > 0) {
      span.setAttribute("chb.auth.token_audience", audienceStrings);
    }
  } catch {
    // A payload we cannot read is itself the signal; the format tag already
    // carries it, and a diagnostic must never fail the request.
  }
};

export class ChbAccessTokenProvider {
  private cached: { token: string; expiresAtMs: number } | null = null;
  /** Single-flight: a burst of billing requests must not stampede Auth0. */
  private inFlight: Promise<string> | null = null;

  constructor(private readonly config: ChbAccessTokenConfig) {}

  /**
   * Drop the cached token so the next call mints a fresh one. Called when CHB
   * rejects a token we still believed was valid.
   */
  invalidate(): void {
    this.cached = null;
  }

  async getToken(): Promise<string> {
    const cached = this.cached;
    if (cached && cached.expiresAtMs > Date.now()) return cached.token;
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.mintToken().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async mintToken(): Promise<string> {
    return await instrumentAsync(
      { name: "chb.auth.token.mint", spanKind: SpanKind.CLIENT },
      async (span) => {
        span.setAttributes({
          "chb.auth.domain": this.config.auth0Domain,
          "chb.auth.audience": this.config.audience,
          "chb.auth.client_id": this.config.clientId,
        });
        return await this.requestToken(span);
      },
    );
  }

  private async requestToken(span: Span): Promise<string> {
    const response = await fetch(
      `https://${this.config.auth0Domain}/oauth/token`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The Auth0 client is configured for `client_secret_post`, so the
        // credentials travel in the body rather than a Basic header.
        body: JSON.stringify({
          grant_type: "client_credentials",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          audience: this.config.audience,
        }),
        // An unexpected redirect must not carry the client secret onward.
        redirect: "error",
        signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
      },
    );

    span.setAttribute("http.status_code", response.status);

    if (!response.ok) {
      // Deliberately not logging the body: Auth0 error payloads echo request
      // parameters back.
      logger.error("[CHB Auth] Client-credentials grant failed", {
        status: response.status,
        audience: this.config.audience,
      });
      throw new ChbAuthError(
        `CHB client-credentials grant failed with status ${response.status}`,
        response.status,
      );
    }

    const parsed = TokenResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      throw new ChbAuthError("CHB token endpoint returned an unusable payload");
    }

    // Renew a margin ahead of expiry, but never wait longer than half the
    // token's life: capping the margin at half the lifetime keeps the buffer
    // proportional for a short-lived token, where subtracting the full margin
    // would re-grant on nearly every call.
    const marginSeconds = Math.min(
      EXPIRY_MARGIN_SECONDS,
      Math.floor(parsed.data.expires_in / 2),
    );
    const lifetimeSeconds = parsed.data.expires_in - marginSeconds;
    this.cached = {
      token: parsed.data.access_token,
      expiresAtMs: Date.now() + lifetimeSeconds * 1000,
    };

    span.setAttribute("chb.auth.expires_in_seconds", parsed.data.expires_in);
    tagTokenClaims(span, parsed.data.access_token);

    return parsed.data.access_token;
  }
}
