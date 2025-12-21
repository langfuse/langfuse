import { validateWebhookURL } from "./validation";
import type { WebhookValidationWhitelist } from "./validation";
import { logger } from "../logger";

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

/**
 * Options for secure redirect handling
 */
export interface RedirectOptions {
  maxRedirects: number;
  skipValidation?: boolean;
  whitelist?: WebhookValidationWhitelist;
}

/**
 * Fetches a URL with manual redirect handling and validation at each step.
 *
 * This function prevents SSRF attacks via redirects by validating each redirect
 * target before following it. It uses the same validation logic as the initial
 * URL validation, checking for blocked hostnames, private IPs, and other SSRF vectors.
 *
 * @param url - The initial URL to fetch
 * @param options - Fetch options (method, body, headers, signal, etc.)
 * @param redirectOptions - Configuration for redirect handling (maxRedirects, skipValidation, whitelist)
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
 *   { maxRedirects: 10, skipValidation: false }
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
  const { maxRedirects, skipValidation = false, whitelist } = redirectOptions;

  // Track redirect chain for loop detection and logging
  const redirectChain: string[] = [];
  let currentUrl = url;
  let redirectDepth = 0;

  // Force manual redirect handling to prevent automatic following
  const fetchOptions: RequestInit = {
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

    // Validate the redirect target URL before following
    if (!skipValidation) {
      try {
        await validateWebhookURL(redirectUrl, whitelist);
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
