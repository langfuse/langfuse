import { z } from "zod";

import { logger } from "@langfuse/shared/src/server";

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

    // A token shorter than the margin would be renewed on every single call, so
    // fall back to using it for its full life rather than hammering Auth0.
    const lifetimeSeconds = Math.max(
      parsed.data.expires_in - EXPIRY_MARGIN_SECONDS,
      Math.min(parsed.data.expires_in, EXPIRY_MARGIN_SECONDS),
    );
    this.cached = {
      token: parsed.data.access_token,
      expiresAtMs: Date.now() + lifetimeSeconds * 1000,
    };
    return parsed.data.access_token;
  }
}
