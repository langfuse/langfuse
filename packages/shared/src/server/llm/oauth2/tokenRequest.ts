import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import type { ResolvedOAuth2Profile } from "../../../interfaces/oauth2Providers";
import { logger } from "../../logger";
import {
  InvalidRedirectResponseError,
  MaxRedirectsExceededError,
} from "../../outbound-url/fetch";
import { OutboundUrlValidationError } from "../../outbound-url/validation";
import { findInCauseChain } from "../errors";
import { fetchSecureLlmUrl } from "../secureLlmFetch";
import type { PreparedOAuth2Credential } from "./credential";
import {
  clientAssertionSigningError,
  OAuth2TokenError,
  type OAuth2TokenFailure,
} from "./errors";

const ASSERTION_LIFETIME_SECONDS = 300;
const DEFAULT_EXPIRES_IN_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 10_000;
const BACKOFF_BASE_MS = 1_000;
const MAX_WAIT_MS = 10_000;
const ERROR_BODY_EXCERPT_LENGTH = 300;
const CLIENT_ASSERTION_TYPE =
  "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const REDACTED = "[redacted]";

export type OAuth2TokenResult = {
  accessToken: string;
  expiresInSeconds: number;
  attempts: number;
};

type TokenHttpRequest = {
  headers: Record<string, string>;
  body: string;
  // values that must never appear in an error message
  sensitiveValues: string[];
};

type AttemptOutcome =
  | { ok: true; accessToken: string; expiresInSeconds: number }
  | {
      ok: false;
      // HTTP status, "network error" or "timeout"
      reason: string;
      failure: OAuth2TokenFailure;
      status?: number;
      retryAfterMs?: number;
      cause?: unknown;
    };

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Signs a client assertion (RFC 7523) for `client_secret_jwt` or
 * `private_key_jwt`. Every call gets a new `jti`, so retries never replay an
 * assertion.
 */
export async function createClientAssertion(
  profile: ResolvedOAuth2Profile,
  credential: PreparedOAuth2Credential,
  nowMs: number = Date.now(),
): Promise<string> {
  const { signingKey, algorithm } = credential;
  if (!signingKey || !algorithm) {
    throw new OAuth2TokenError(
      "config",
      `${profile.authMethod} requires a signing key`,
    );
  }
  const issuedAt = Math.floor(nowMs / 1000);
  try {
    return await new SignJWT({})
      .setProtectedHeader({
        ...credential.protectedHeader,
        alg: algorithm,
        typ: "JWT",
      })
      .setIssuer(profile.clientId)
      .setSubject(profile.clientId)
      .setAudience(profile.assertionAudience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ASSERTION_LIFETIME_SECONDS)
      .setJti(randomUUID())
      .sign(signingKey);
  } catch {
    throw clientAssertionSigningError();
  }
}

/**
 * Requests an access token with the client credentials grant. 429, 5xx,
 * network errors and timeouts are retried up to `maxRetries` times with
 * exponential backoff and full jitter; a 429 `Retry-After` replaces the
 * backoff. Redirects are never followed.
 *
 * @throws OAuth2TokenError `config` when the request cannot be built (e.g.
 * the key cannot sign the client assertion), `credential` for a rejected or
 * unusable response, `unavailable` once all attempts failed transiently.
 */
export async function requestOAuth2Token({
  profile,
  credential,
  maxRetries,
  sleep = defaultSleep,
}: {
  profile: ResolvedOAuth2Profile;
  credential: PreparedOAuth2Credential;
  maxRetries: number;
  sleep?: (ms: number) => Promise<void>;
}): Promise<OAuth2TokenResult> {
  const maxAttempts = maxRetries + 1;
  const host = new URL(profile.tokenEndpoint).host;

  for (let attempt = 1; ; attempt++) {
    const outcome = await attemptTokenRequest(profile, credential);
    if (outcome.ok) {
      return {
        accessToken: outcome.accessToken,
        expiresInSeconds: outcome.expiresInSeconds,
        attempts: attempt,
      };
    }
    if (attempt >= maxAttempts) {
      throw new OAuth2TokenError(
        "unavailable",
        `OAuth2 token endpoint unavailable after ${attempt} attempts: ${outcome.reason}`,
        {
          status: outcome.status,
          lastFailure: outcome.failure,
          cause: outcome.cause,
        },
      );
    }
    logger.warn("OAuth2 token request failed, retrying", {
      host,
      attempt,
      reason: outcome.reason,
    });
    await sleep(outcome.retryAfterMs ?? backoffMs(attempt));
  }
}

async function attemptTokenRequest(
  profile: ResolvedOAuth2Profile,
  credential: PreparedOAuth2Credential,
): Promise<AttemptOutcome> {
  const request = await buildTokenHttpRequest(profile, credential);

  let response: Response;
  let responseText: string;
  try {
    response = await fetchSecureLlmUrl(
      profile.tokenEndpoint,
      {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
      // A followed redirect would re-send the credentials to another URL.
      { logContext: "OAuth2 token endpoint", maxRedirects: 0 },
    );
    if (isTransientStatus(response.status)) {
      await response.body?.cancel();
      return {
        ok: false,
        reason: String(response.status),
        failure: "status",
        status: response.status,
        retryAfterMs:
          response.status === 429
            ? parseRetryAfterMs(response.headers.get("Retry-After"))
            : undefined,
      };
    }
    responseText = await response.text();
  } catch (error) {
    if (
      findInCauseChain(
        error,
        (candidate): candidate is Error =>
          candidate instanceof MaxRedirectsExceededError ||
          candidate instanceof InvalidRedirectResponseError,
      )
    ) {
      throw new OAuth2TokenError(
        "credential",
        "OAuth2 token endpoint responded with a redirect, which is not followed",
        { cause: error },
      );
    }
    // Validation failures are permanent policy decisions; a failed DNS lookup
    // may recover and is retried.
    const validationError = findInCauseChain(
      error,
      (candidate): candidate is OutboundUrlValidationError =>
        candidate instanceof OutboundUrlValidationError &&
        candidate.code !== "dns-lookup-failed",
    );
    if (validationError) {
      throw new OAuth2TokenError(
        "disabled",
        `OAuth2 token endpoint blocked: ${validationError.message}`,
        { cause: error },
      );
    }
    const failure = isTimeout(error) ? "timeout" : "network";
    return {
      ok: false,
      reason: failure === "timeout" ? "timeout" : "network error",
      failure,
      cause: error,
    };
  }

  if (!response.ok) {
    const excerpt = redact(responseText, request.sensitiveValues).slice(
      0,
      ERROR_BODY_EXCERPT_LENGTH,
    );
    throw new OAuth2TokenError(
      "credential",
      `OAuth2 token endpoint returned ${response.status}: ${excerpt}`,
      { status: response.status },
    );
  }

  return { ok: true, ...parseTokenResponse(responseText) };
}

async function buildTokenHttpRequest(
  profile: ResolvedOAuth2Profile,
  credential: PreparedOAuth2Credential,
): Promise<TokenHttpRequest> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    ...profile.formParams,
  });
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  switch (profile.authMethod) {
    case "client_secret_basic": {
      const secret = requireSecret(profile, credential);
      // RFC 6749 §2.3.1: both parts are form-encoded before base64.
      const userPass = `${encodeURIComponent(profile.clientId)}:${encodeURIComponent(secret)}`;
      const encodedUserPass = Buffer.from(userPass).toString("base64");
      headers.Authorization = `Basic ${encodedUserPass}`;
      return {
        headers,
        body: body.toString(),
        sensitiveValues: [secret, encodedUserPass],
      };
    }
    case "client_secret_post": {
      const secret = requireSecret(profile, credential);
      body.set("client_id", profile.clientId);
      body.set("client_secret", secret);
      return { headers, body: body.toString(), sensitiveValues: [secret] };
    }
    case "client_secret_jwt":
    case "private_key_jwt": {
      const assertion = await createClientAssertion(profile, credential);
      if (profile.sendClientIdWithAssertion) {
        body.set("client_id", profile.clientId);
      }
      body.set("client_assertion_type", CLIENT_ASSERTION_TYPE);
      body.set("client_assertion", assertion);
      const sensitiveValues = [assertion];
      if (credential.signingKey instanceof Uint8Array) {
        sensitiveValues.push(new TextDecoder().decode(credential.signingKey));
      }
      return { headers, body: body.toString(), sensitiveValues };
    }
  }
}

function requireSecret(
  profile: ResolvedOAuth2Profile,
  credential: PreparedOAuth2Credential,
): string {
  if (!credential.secret) {
    throw new OAuth2TokenError(
      "config",
      `${profile.authMethod} requires a client secret`,
    );
  }
  return credential.secret;
}

// Replaces each value as sent raw, percent-encoded and form-encoded, and as
// echoed inside a JSON string (with and without "/" escaped); longest first
// so a value contained in another one's encoding cannot leave a part.
function redact(text: string, sensitiveValues: string[]): string {
  const variants = new Set<string>();
  for (const value of sensitiveValues) {
    if (value.length === 0) continue;
    const jsonEscaped = JSON.stringify(value).slice(1, -1);
    variants.add(value);
    variants.add(encodeURIComponent(value));
    variants.add(new URLSearchParams({ v: value }).toString().slice(2));
    variants.add(jsonEscaped);
    variants.add(jsonEscaped.replaceAll("/", "\\/"));
  }
  return [...variants]
    .sort((a, b) => b.length - a.length)
    .reduce((result, variant) => result.replaceAll(variant, REDACTED), text);
}

function parseTokenResponse(text: string): {
  accessToken: string;
  expiresInSeconds: number;
} {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = undefined;
  }
  if (
    !isRecord(payload) ||
    typeof payload.access_token !== "string" ||
    payload.access_token.length === 0
  ) {
    throw new OAuth2TokenError(
      "credential",
      "token response missing access_token",
    );
  }
  return {
    accessToken: payload.access_token,
    expiresInSeconds: parseExpiresIn(payload.expires_in),
  };
}

// Some providers send expires_in as a numeric string.
function parseExpiresIn(value: unknown): number {
  const seconds =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof seconds === "number" &&
    Number.isSafeInteger(seconds) &&
    seconds > 0
    ? seconds
    : DEFAULT_EXPIRES_IN_SECONDS;
}

// 408 Request Timeout, 429 Too Many Requests and 5xx.
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Math.min(Number(header.trim()) * 1000, MAX_WAIT_MS);
}

// Full jitter over base * 2^(attempt - 1), capped.
function backoffMs(attempt: number): number {
  return (
    Math.random() * Math.min(MAX_WAIT_MS, BACKOFF_BASE_MS * 2 ** (attempt - 1))
  );
}

function isTimeout(error: unknown): boolean {
  return (
    findInCauseChain(
      error,
      (candidate): candidate is Error =>
        candidate instanceof Error && candidate.name === "TimeoutError",
    ) !== undefined
  );
}
