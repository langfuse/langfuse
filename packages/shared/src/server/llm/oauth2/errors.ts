import { RetryError } from "ai";

import { findInCauseChain } from "../errors";

export type OAuth2TokenErrorKind =
  | "config"
  | "credential"
  | "disabled"
  | "unavailable";

// How the last attempt of an `unavailable` token request failed: no response
// ("network", "timeout") or a retryable HTTP status ("status").
export type OAuth2TokenFailure = "network" | "timeout" | "status";

/**
 * A deterministic failure in the OAuth2 client-credentials token path:
 * resolving a provider profile, checking the token endpoint allowlist, or
 * requesting/parsing a token. `kind` drives how callers classify and react
 * to the failure (evaluator block reason, queue retry behavior, etc.).
 */
export class OAuth2TokenError extends Error {
  readonly kind: OAuth2TokenErrorKind;
  readonly status?: number;
  readonly lastFailure?: OAuth2TokenFailure;

  constructor(
    kind: OAuth2TokenErrorKind,
    message: string,
    opts?: {
      status?: number;
      lastFailure?: OAuth2TokenFailure;
      cause?: unknown;
    },
  ) {
    super(message, { cause: opts?.cause });
    this.name = "OAuth2TokenError";
    this.kind = kind;
    this.status = opts?.status;
    this.lastFailure = opts?.lastFailure;
  }
}

/**
 * jose checks some key properties, such as the RSA modulus length, only when
 * signing. Its error is not passed on: it may describe the key.
 */
export const clientAssertionSigningError = () =>
  new OAuth2TokenError(
    "config",
    "Could not sign the client assertion with the configured key",
  );

/**
 * Walks an error's `.cause` chain looking for an `OAuth2TokenError`, so
 * callers can classify a failure that provider SDKs or retry wrappers have
 * re-wrapped. An AI SDK `RetryError`'s constructor never sets `cause`, so a
 * wrapped error only reaches it via `.lastError`; whenever the chain walk
 * finds one, it hops onto `.lastError` and resumes the `.cause` walk from
 * there. Cycle-safe: a chain that loops back on itself (through `.cause` or
 * through repeated `.lastError` hops) returns `undefined` instead of looping
 * forever.
 */
export function findOAuth2TokenError(
  error: unknown,
): OAuth2TokenError | undefined {
  const visited = new Set<unknown>();
  let current = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);

    const tokenError = findInCauseChain(
      current,
      (candidate): candidate is OAuth2TokenError =>
        candidate instanceof OAuth2TokenError,
    );
    if (tokenError) return tokenError;

    const retryError = findInCauseChain(current, RetryError.isInstance);
    current = retryError?.lastError;
  }

  return undefined;
}
