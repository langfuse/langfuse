import { addSecureOutboundConnectionValidation } from "./connection";
import type { OutboundUrlValidationWhitelist } from "./validation";
import { logger } from "../logger";
import { WebhookSignatureHeader } from "../../domain/webhooks";

const SENSITIVE_REDIRECT_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  WebhookSignatureHeader,
]);

// A Location header may carry userinfo, so a rejected target can hold a
// password. Strip it before the URL reaches a log line or a retained error.
// Anchored on `://` rather than on a scheme pattern: a leading `[a-z][a-z0-9+.-]*`
// rescans and backtracks at every offset of an attacker-supplied string, which
// is quadratic, and the scheme itself contributes nothing to the match.
const URL_CREDENTIALS = /:\/\/[^/?#\s@]*@/g;

export const redactUrlCredentials = (text: string): string =>
  text.replace(URL_CREDENTIALS, "://***@");

/**
 * Scheme, host, and path for logs and persisted errors. Query strings and
 * fragments are dropped because webhook destinations put shared secrets there
 * (`sig`, SAS tokens). Userinfo is dropped too. Built from protocol and host
 * because `URL.origin` is the string "null" for non-special schemes.
 */
export const urlForLog = (urlString: string): string => {
  try {
    const url = new URL(urlString);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    const withoutFragment = urlString.split("#")[0] ?? urlString;
    const withoutQuery = withoutFragment.split("?")[0] ?? withoutFragment;
    return redactUrlCredentials(withoutQuery);
  }
};

/**
 * Custom error for redirect validation failures. `cause` is required so the
 * inner error's typed `code` survives for classification, and goes through the
 * options bag so it stays non-enumerable — a structured logger serializes every
 * enumerable field, and the rejected target may carry credentials.
 */
export class RedirectValidationError extends Error {
  readonly redirectUrl: string;
  readonly redirectDepth: number;

  constructor(
    message: string,
    redirectUrl: string,
    redirectDepth: number,
    cause: unknown,
  ) {
    const loggedUrl = urlForLog(redirectUrl);
    super(
      `Redirect validation failed at depth ${redirectDepth} for url ${loggedUrl}: ${message}`,
      { cause },
    );
    this.name = "RedirectValidationError";
    this.redirectUrl = loggedUrl;
    this.redirectDepth = redirectDepth;
  }
}

/**
 * Custom error for exceeding maximum redirect depth
 */
export class MaxRedirectsExceededError extends Error {
  readonly maxRedirects: number;
  readonly redirectChain: string[];

  constructor(maxRedirects: number, redirectChain: string[]) {
    const chainForLog = redirectChain.map(urlForLog);
    super(
      `Maximum redirects (${maxRedirects}) exceeded. Chain: ${chainForLog.join(" → ")}`,
    );
    this.name = "MaxRedirectsExceededError";
    this.maxRedirects = maxRedirects;
    this.redirectChain = chainForLog;
  }
}

/**
 * Custom error for circular redirect detection
 */
export class CircularRedirectError extends Error {
  readonly redirectChain: string[];

  constructor(redirectChain: string[]) {
    const chainForLog = redirectChain.map(urlForLog);
    super(`Circular redirect detected: ${chainForLog.join(" → ")}`);
    this.name = "CircularRedirectError";
    this.redirectChain = chainForLog;
  }
}

/**
 * Result of following redirects with validation
 */
export interface RedirectResult {
  response: Response;
  redirectChain: string[];
  finalUrl: string;
}

export type RedirectUrlValidator = (
  url: string,
  whitelist?: OutboundUrlValidationWhitelist,
) => Promise<void>;

interface BaseRedirectOptions {
  maxRedirects: number;
  additionalSensitiveHeaders?: string[];
}

interface RedirectValidationOptions {
  validateUrl: RedirectUrlValidator;
  whitelist?: OutboundUrlValidationWhitelist;
  logContext?: string;
  addressAttemptTimeoutMs?: number;
}

/**
 * Options for secure redirect handling
 */
export type RedirectOptions =
  | (BaseRedirectOptions & {
      skipValidation: true;
      redirectValidation?: never;
    })
  | (BaseRedirectOptions & {
      skipValidation?: false;
      redirectValidation: RedirectValidationOptions;
    });

/**
 * Fetches a URL with manual redirect handling and validation at each step.
 *
 * This function prevents SSRF attacks via redirects by validating each redirect
 * target before following it. Callers provide URL validation so each outbound
 * flow can enforce its own protocol, port, and whitelist rules.
 *
 * @param url - The initial URL to fetch
 * @param options - Fetch options (method, body, headers, signal, etc.)
 * @param redirectOptions - Configuration for redirect handling (maxRedirects, validation, whitelist)
 * @returns Promise resolving to the final response, redirect chain, and final URL
 * @throws RedirectValidationError if a redirect target fails validation
 * @throws MaxRedirectsExceededError if redirect depth exceeds maxRedirects
 * @throws CircularRedirectError if a redirect loop is detected
 *
 * @example
 * ```typescript
 * const result = await fetchWithSecureRedirects(
 *   "https://example.com/webhook",
 *   { method: "POST", body: payload, headers, signal },
 *   {
 *     maxRedirects: 10,
 *     redirectValidation: { validateUrl: validateWebhookURL },
 *   }
 * );
 * console.log(`Final URL: ${result.finalUrl}`);
 * console.log(`Redirects: ${result.redirectChain.length}`);
 * ```
 */
export async function fetchWithSecureRedirects(
  url: string,
  options: RequestInit,
  redirectOptions: RedirectOptions,
): Promise<RedirectResult> {
  const { maxRedirects, additionalSensitiveHeaders = [] } = redirectOptions;
  const sensitiveRedirectHeaders = new Set([
    ...SENSITIVE_REDIRECT_HEADERS,
    ...additionalSensitiveHeaders.map((headerName) => headerName.toLowerCase()),
  ]);

  // Track redirect chain for loop detection and logging
  const redirectChain: string[] = [];
  let currentUrl = url;
  let redirectDepth = 0;

  // Disable automatic redirects so every Location target is validated before
  // following it, and attach connection-time DNS/IP validation for each fetch.
  let fetchOptions: RequestInit = addConnectionTimeValidation(
    {
      ...options,
      redirect: "manual",
    },
    redirectOptions,
  );

  while (redirectDepth <= maxRedirects) {
    logger.debug("Fetching URL with manual redirect handling", {
      url: urlForLog(currentUrl),
      redirectDepth,
      maxRedirects,
    });

    // Fetch the current URL
    const response = await fetch(currentUrl, fetchOptions);

    // Check if this is a redirect response (3xx status codes)
    const isRedirect =
      response.status >= 300 &&
      response.status < 400 &&
      response.status !== 304; // 304 Not Modified is not a redirect

    if (!isRedirect) {
      // This is the final response, return it
      logger.debug("Received non-redirect response", {
        url: urlForLog(currentUrl),
        status: response.status,
        redirectDepth,
      });

      return {
        response,
        redirectChain,
        finalUrl: currentUrl,
      };
    }

    // Extract the Location header for the redirect target
    const location = response.headers.get("Location");

    if (!location) {
      throw new Error(
        `Redirect response (${response.status}) missing Location header at ${urlForLog(currentUrl)}`,
      );
    }

    // Resolve relative URLs against the current URL
    let redirectUrl: string;
    try {
      const resolvedUrl = new URL(location, currentUrl);
      redirectUrl = resolvedUrl.toString();
    } catch (error) {
      throw new Error(
        `Invalid redirect URL "${urlForLog(location)}" at ${urlForLog(currentUrl)}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    logger.debug("Redirect detected", {
      from: urlForLog(currentUrl),
      to: urlForLog(redirectUrl),
      status: response.status,
      redirectDepth,
    });

    // Check for circular redirects
    if (redirectChain.includes(redirectUrl)) {
      throw new CircularRedirectError([...redirectChain, redirectUrl]);
    }

    // Add current URL to redirect chain before following
    redirectChain.push(currentUrl);

    // Check if we've hit the redirect limit
    if (redirectDepth >= maxRedirects) {
      throw new MaxRedirectsExceededError(maxRedirects, [
        ...redirectChain,
        redirectUrl,
      ]);
    }

    if (redirectOptions.skipValidation !== true) {
      try {
        // Redirect safety is domain-specific: webhooks allow HTTP(S) on 80/443,
        // while image URLs require HTTPS. Keep the fetch helper generic and
        // require callers to pass the validator that matches their flow.
        await redirectOptions.redirectValidation.validateUrl(
          redirectUrl,
          redirectOptions.redirectValidation.whitelist,
        );
      } catch (error) {
        logger.warn("Redirect validation failed", {
          from: urlForLog(currentUrl),
          to: urlForLog(redirectUrl),
          redirectDepth,
          error:
            error instanceof Error
              ? redactUrlCredentials(error.message)
              : "Unknown error",
        });

        throw new RedirectValidationError(
          error instanceof Error ? error.message : "Validation failed",
          redirectUrl,
          redirectDepth,
          error,
        );
      }
    }

    const currentOrigin = new URL(currentUrl).origin;
    const redirectOrigin = new URL(redirectUrl).origin;
    if (currentOrigin !== redirectOrigin) {
      const { headers, strippedHeaderNames } = stripSensitiveRedirectHeaders(
        fetchOptions.headers,
        sensitiveRedirectHeaders,
      );

      if (strippedHeaderNames.length > 0) {
        logger.warn("Stripping sensitive headers for cross-origin redirect", {
          from: currentOrigin,
          to: redirectOrigin,
          redirectDepth,
          strippedHeaderNames,
        });

        fetchOptions = {
          ...fetchOptions,
          // Sensitive credentials are origin-scoped. Keep them on same-origin
          // redirects, but strip them before a cross-origin follow-up request.
          headers,
        };
      }
    }

    // Follow the redirect
    currentUrl = redirectUrl;
    redirectDepth++;
  }

  // This should never be reached due to the check inside the loop,
  // but included for completeness
  throw new MaxRedirectsExceededError(maxRedirects, [
    ...redirectChain,
    currentUrl,
  ]);
}

function addConnectionTimeValidation(
  options: RequestInit,
  redirectOptions: RedirectOptions,
): RequestInit {
  if (redirectOptions.skipValidation === true) {
    return options;
  }

  return addSecureOutboundConnectionValidation(options, {
    whitelist: redirectOptions.redirectValidation.whitelist,
    logContext: redirectOptions.redirectValidation.logContext,
    addressAttemptTimeoutMs:
      redirectOptions.redirectValidation.addressAttemptTimeoutMs,
  });
}

function stripSensitiveRedirectHeaders(
  headers: RequestInit["headers"],
  sensitiveHeaderNames: Set<string>,
): {
  headers: RequestInit["headers"];
  strippedHeaderNames: string[];
} {
  const strippedHeaderNames: string[] = [];

  const headerEntries = Array.from(new Headers(headers).entries()).filter(
    ([headerName]) => {
      if (sensitiveHeaderNames.has(headerName)) {
        strippedHeaderNames.push(headerName);
        return false;
      }

      return true;
    },
  );

  return {
    headers: new Headers(headerEntries),
    strippedHeaderNames,
  };
}
