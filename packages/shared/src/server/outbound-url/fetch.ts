import type { OutboundUrlValidationWhitelist } from "./validation";
import { logger } from "../logger";

const SENSITIVE_REDIRECT_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "x-langfuse-signature",
]);

/**
 * Custom error for redirect validation failures
 */
export class RedirectValidationError extends Error {
  constructor(
    message: string,
    public redirectUrl: string,
    public redirectDepth: number,
  ) {
    super(
      `Redirect validation failed at depth ${redirectDepth} for url ${redirectUrl}: ${message}`,
    );
    this.name = "RedirectValidationError";
  }
}

/**
 * Custom error for exceeding maximum redirect depth
 */
export class MaxRedirectsExceededError extends Error {
  constructor(
    public maxRedirects: number,
    public redirectChain: string[],
  ) {
    super(
      `Maximum redirects (${maxRedirects}) exceeded. Chain: ${redirectChain.join(" → ")}`,
    );
    this.name = "MaxRedirectsExceededError";
  }
}

/**
 * Custom error for circular redirect detection
 */
export class CircularRedirectError extends Error {
  constructor(public redirectChain: string[]) {
    super(`Circular redirect detected: ${redirectChain.join(" → ")}`);
    this.name = "CircularRedirectError";
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
 * target before following it. Callers provide validation so each outbound flow
 * can enforce its own protocol, port, and whitelist rules.
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

  // Force manual redirect handling to prevent automatic following.
  let fetchOptions: RequestInit = {
    ...options,
    redirect: "manual",
  };

  while (redirectDepth <= maxRedirects) {
    logger.debug("Fetching URL with manual redirect handling", {
      url: currentUrl,
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
        url: currentUrl,
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
        `Redirect response (${response.status}) missing Location header at ${currentUrl}`,
      );
    }

    // Resolve relative URLs against the current URL
    let redirectUrl: string;
    try {
      const resolvedUrl = new URL(location, currentUrl);
      redirectUrl = resolvedUrl.toString();
    } catch (error) {
      throw new Error(
        `Invalid redirect URL "${location}" at ${currentUrl}: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    logger.debug("Redirect detected", {
      from: currentUrl,
      to: redirectUrl,
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
          from: currentUrl,
          to: redirectUrl,
          redirectDepth,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        throw new RedirectValidationError(
          error instanceof Error ? error.message : "Validation failed",
          redirectUrl,
          redirectDepth,
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
