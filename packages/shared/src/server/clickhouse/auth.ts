import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

import { env } from "../../env";
import { logger } from "../logger";

/**
 * ClickHouse authentication for the app's own connections.
 *
 * `password` mode sends CLICKHOUSE_USER and CLICKHOUSE_PASSWORD. `jwt` mode
 * sends a bearer token instead, which ClickHouse Cloud validates against the
 * identity provider configured for the service. The token comes from one of
 * three sources:
 *
 * - CLICKHOUSE_JWT_TOKEN: a fixed token, for tests and short-lived deployments.
 * - CLICKHOUSE_JWT_TOKEN_FILE: a file kept current by the platform, such as a
 *   Kubernetes projected service account token or a Vault agent sidecar.
 * - CLICKHOUSE_JWT_TOKEN_URL: an OAuth 2.0 token endpoint, called with the
 *   client credentials grant.
 *
 * Tokens are read synchronously so that `clickhouseClient()` stays
 * synchronous. Sources that need network access fetch the first token in
 * `initializeClickhouseAuth()` and renew it in the background.
 */

type ClickhouseClientAuthConfig =
  | { username: string | undefined; password: string | undefined }
  | { access_token: string };

export type ClickhouseAuth = {
  config: ClickhouseClientAuthConfig;
  /** Identifies the credential without containing it, for client cache keys. */
  fingerprint: string;
};

interface ClickhouseTokenSource {
  /** Loads the first token. Rejects when no token can be obtained. */
  initialize(): Promise<void>;
  /** Returns the token to send now. Throws when no valid token is available. */
  currentToken(): string;
  close(): void;
}

/** Renew this long before expiry so a request cannot arrive with a token that expired in transit. */
const TOKEN_RENEWAL_MARGIN_SECONDS = 300;
/** Lifetime assumed when the token endpoint reports none and the token is opaque. */
const DEFAULT_TOKEN_LIFETIME_SECONDS = 300;
/** How often a token file is re-read even when its token has not expired. */
const TOKEN_FILE_RECHECK_MS = 30_000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;
const TOKEN_RETRY_INITIAL_DELAY_MS = 1_000;
const TOKEN_RETRY_MAX_DELAY_MS = 60_000;

class ClickhouseAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClickhouseAuthError";
  }
}

/**
 * Reads the `exp` claim without verifying the signature. Used only to decide
 * when to renew a token Langfuse is about to send, never to authorize anything.
 */
const readJwtExpiryMs = (token: string): number | null => {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { exp?: unknown };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
};

/** Renews ahead of expiry, by at most half the token's remaining life. */
const renewalTimeMs = (expiresAtMs: number, nowMs: number): number => {
  const remainingMs = Math.max(0, expiresAtMs - nowMs);
  const marginMs = Math.min(
    TOKEN_RENEWAL_MARGIN_SECONDS * 1000,
    Math.floor(remainingMs / 2),
  );
  return expiresAtMs - marginMs;
};

const fingerprintOf = (secret: string): string =>
  createHash("sha256").update(secret).digest("hex").slice(0, 16);

class StaticTokenSource implements ClickhouseTokenSource {
  constructor(private readonly token: string) {}

  async initialize(): Promise<void> {
    const expiresAtMs = readJwtExpiryMs(this.token);
    if (expiresAtMs !== null && expiresAtMs <= Date.now()) {
      throw new ClickhouseAuthError("CLICKHOUSE_JWT_TOKEN has expired");
    }
    if (expiresAtMs !== null && expiresAtMs - Date.now() < 3_600_000) {
      logger.warn(
        "CLICKHOUSE_JWT_TOKEN expires within an hour and is never renewed. Use CLICKHOUSE_JWT_TOKEN_FILE or CLICKHOUSE_JWT_TOKEN_URL for long-running deployments.",
        { expiresAt: new Date(expiresAtMs).toISOString() },
      );
    }
  }

  currentToken(): string {
    return this.token;
  }

  close(): void {}
}

export class FileTokenSource implements ClickhouseTokenSource {
  private cached: {
    token: string;
    readAtMs: number;
    renewAtMs: number;
  } | null = null;

  constructor(private readonly path: string) {}

  async initialize(): Promise<void> {
    this.currentToken();
  }

  currentToken(): string {
    const now = Date.now();
    const cached = this.cached;
    if (
      cached &&
      now - cached.readAtMs < TOKEN_FILE_RECHECK_MS &&
      now < cached.renewAtMs
    ) {
      return cached.token;
    }

    let token: string;
    try {
      token = readFileSync(this.path, "utf8").trim();
    } catch (error) {
      if (cached && now < (readJwtExpiryMs(cached.token) ?? Infinity)) {
        logger.warn("Failed to re-read ClickHouse token file; reusing token", {
          path: this.path,
          error: error instanceof Error ? error.message : String(error),
        });
        return cached.token;
      }
      throw new ClickhouseAuthError(
        `Cannot read ClickHouse token file ${this.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!token) {
      throw new ClickhouseAuthError(
        `ClickHouse token file ${this.path} is empty`,
      );
    }

    const expiresAtMs = readJwtExpiryMs(token);
    this.cached = {
      token,
      readAtMs: now,
      renewAtMs:
        expiresAtMs === null ? Infinity : renewalTimeMs(expiresAtMs, now),
    };
    return token;
  }

  close(): void {}
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  // Seconds. Optional in RFC 6749, section 5.1.
  expires_in: z.coerce.number().positive().optional(),
});

export type ClientCredentialsConfig = {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  authMethod: "client_secret_basic" | "client_secret_post";
  scope?: string;
  audience?: string;
};

/**
 * OAuth 2.0 client credentials grant (RFC 6749, section 4.4). Renews the
 * token in the background before it expires and keeps serving the current
 * token while a renewal is retried.
 */
export class ClientCredentialsTokenSource implements ClickhouseTokenSource {
  private cached: {
    token: string;
    expiresAtMs: number;
    renewAtMs: number;
  } | null = null;
  /** Single flight: concurrent renewals share one token request. */
  private inFlight: Promise<string> | null = null;
  private renewalTimer: NodeJS.Timeout | null = null;
  private retryDelayMs = TOKEN_RETRY_INITIAL_DELAY_MS;
  private closed = false;

  constructor(private readonly config: ClientCredentialsConfig) {}

  async initialize(): Promise<void> {
    await this.renew();
  }

  currentToken(): string {
    const cached = this.cached;
    const now = Date.now();
    if (cached && now >= cached.renewAtMs) {
      this.renew().catch(() => {});
    }
    if (cached && now < cached.expiresAtMs) return cached.token;

    if (!cached) this.renew().catch(() => {});
    throw new ClickhouseAuthError(
      "No valid ClickHouse access token is available yet; a token request is in progress",
    );
  }

  close(): void {
    this.closed = true;
    if (this.renewalTimer) clearTimeout(this.renewalTimer);
    this.renewalTimer = null;
  }

  private renew(): Promise<string> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.requestToken()
      .then(
        (token) => {
          this.retryDelayMs = TOKEN_RETRY_INITIAL_DELAY_MS;
          this.schedule(this.cached!.renewAtMs - Date.now());
          return token;
        },
        (error: unknown) => {
          logger.error("ClickHouse access token request failed", {
            tokenUrl: this.config.tokenUrl,
            error: error instanceof Error ? error.message : String(error),
          });
          this.schedule(this.retryDelayMs);
          this.retryDelayMs = Math.min(
            this.retryDelayMs * 2,
            TOKEN_RETRY_MAX_DELAY_MS,
          );
          throw error;
        },
      )
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private schedule(delayMs: number): void {
    if (this.closed) return;
    if (this.renewalTimer) clearTimeout(this.renewalTimer);
    this.renewalTimer = setTimeout(
      () => {
        this.renewalTimer = null;
        this.renew().catch(() => {});
      },
      Math.max(0, delayMs),
    );
    this.renewalTimer.unref();
  }

  private async requestToken(): Promise<string> {
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    if (this.config.scope) body.set("scope", this.config.scope);
    if (this.config.audience) body.set("audience", this.config.audience);

    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    if (this.config.authMethod === "client_secret_basic") {
      // RFC 6749, section 2.3.1: form-encode both parts before joining.
      const credentials = `${encodeURIComponent(this.config.clientId)}:${encodeURIComponent(this.config.clientSecret)}`;
      headers.authorization = `Basic ${Buffer.from(credentials).toString("base64")}`;
    } else {
      body.set("client_id", this.config.clientId);
      body.set("client_secret", this.config.clientSecret);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: "POST",
      headers,
      body,
      // A redirect must not carry the client secret to another host.
      redirect: "error",
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // The body is not logged: token endpoint errors can echo the request.
      throw new ClickhouseAuthError(
        `Token endpoint responded with status ${response.status}`,
      );
    }

    const parsed = TokenResponseSchema.safeParse(
      await response.json().catch(() => undefined),
    );
    if (!parsed.success) {
      throw new ClickhouseAuthError(
        "Token endpoint returned a response without an access_token",
      );
    }

    const now = Date.now();
    const token = parsed.data.access_token;
    const expiresAtMs =
      parsed.data.expires_in !== undefined
        ? now + parsed.data.expires_in * 1000
        : (readJwtExpiryMs(token) ??
          now + DEFAULT_TOKEN_LIFETIME_SECONDS * 1000);
    this.cached = {
      token,
      expiresAtMs,
      renewAtMs: renewalTimeMs(expiresAtMs, now),
    };
    return token;
  }
}

const createTokenSource = (): ClickhouseTokenSource => {
  if (env.CLICKHOUSE_JWT_TOKEN_URL) {
    return new ClientCredentialsTokenSource({
      tokenUrl: env.CLICKHOUSE_JWT_TOKEN_URL,
      clientId: env.CLICKHOUSE_JWT_CLIENT_ID ?? "",
      clientSecret: env.CLICKHOUSE_JWT_CLIENT_SECRET ?? "",
      authMethod: env.CLICKHOUSE_JWT_CLIENT_AUTH_METHOD,
      scope: env.CLICKHOUSE_JWT_SCOPE,
      audience: env.CLICKHOUSE_JWT_AUDIENCE,
    });
  }
  if (env.CLICKHOUSE_JWT_TOKEN_FILE) {
    return new FileTokenSource(env.CLICKHOUSE_JWT_TOKEN_FILE);
  }
  if (env.CLICKHOUSE_JWT_TOKEN) {
    return new StaticTokenSource(env.CLICKHOUSE_JWT_TOKEN);
  }
  throw new ClickhouseAuthError(
    "CLICKHOUSE_AUTH_MODE is jwt but none of CLICKHOUSE_JWT_TOKEN, CLICKHOUSE_JWT_TOKEN_FILE or CLICKHOUSE_JWT_TOKEN_URL is set",
  );
};

let tokenSource: ClickhouseTokenSource | null = null;

const getTokenSource = (): ClickhouseTokenSource => {
  if (!tokenSource) tokenSource = createTokenSource();
  return tokenSource;
};

/** The credentials to use for a ClickHouse connection opened now. */
export const getClickhouseAuth = (): ClickhouseAuth => {
  if (env.CLICKHOUSE_AUTH_MODE === "jwt") {
    const token = getTokenSource().currentToken();
    return {
      config: { access_token: token },
      fingerprint: `jwt:${fingerprintOf(token)}`,
    };
  }

  // The env schema requires both values in password mode. They are passed
  // through unchecked here so that builds with DOCKER_BUILD=1, which skip env
  // validation, behave as before.
  return {
    config: {
      username: env.CLICKHOUSE_USER,
      password: env.CLICKHOUSE_PASSWORD,
    },
    fingerprint: `password:${env.CLICKHOUSE_USER ?? ""}`,
  };
};

/**
 * Obtains the first ClickHouse access token in `jwt` mode, so that a wrong
 * token configuration stops startup instead of failing every query.
 */
export const initializeClickhouseAuth = async (): Promise<void> => {
  if (env.CLICKHOUSE_AUTH_MODE !== "jwt") return;
  await getTokenSource().initialize();
};

export const resetClickhouseAuthForTests = (): void => {
  tokenSource?.close();
  tokenSource = null;
};
