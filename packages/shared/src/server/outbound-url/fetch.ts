import type { OutboundUrlValidationWhitelist } from "./validation";
import { logger } from "../logger";
import { env } from "../../env";
import { createPinnedAgent } from "../webhooks/pinnedAgent";
import { type Agent } from "undici";

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

/**
 * Validates a redirect target URL and returns the resolved IPs so the next-hop
 * fetch can pin DNS to those addresses. Validators that do not need pinning
 * may return an empty array.
 */
export type RedirectUrlValidator = (
  url: string,
  whitelist?: OutboundUrlValidationWhitelist,
) => Promise<string[]>;

interface BaseRedirectOptions {
  maxRedirects: number;
  additionalSensitiveHeaders?: string[];
}

interface RedirectValidationOptions {
  validateUrl: RedirectUrlValidator;
  whitelist?: OutboundUrlValidationWhitelist;
  /**
   * Pre-resolved IPs for the initial URL (typically returned by the same
   * validator the caller already invoked). When provided, the first hop pins
   * DNS to these IPs to close the TOCTOU gap between validation and fetch.
   */
  initialResolvedIPs?: string[];
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
 * When validators return resolved IPs, fetch pins DNS to those addresses via
 * an undici Agent to close the TOCTOU gap between validation and connect.
 * Pinning is skipped automatically when HTTPS_PROXY is configured because the
 * proxy handles DNS + connection routing.
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
 *     redirectValidation: {
 *       validateUrl: validateWebhookURLAndGetIPs,
 *       initialResolvedIPs,
 *     },
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

  // When HTTPS_PROXY is configured the proxy handles DNS + connection routing,
  // so we skip our own IP pinning to avoid conflicts.
  const useIPPinning = !env.HTTPS_PROXY;

  // Track redirect chain for loop detection and logging
  const redirectChain: string[] = [];
  let currentUrl = url;
  let redirectDepth = 0;
  let currentResolvedIPs: string[] | undefined =
    redirectOptions.skipValidation === true
      ? undefined
      : useIPPinning
        ? redirectOptions.redirectValidation.initialResolvedIPs
        : undefined;

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

    // Build per-request fetch options, pinning DNS when we have validated IPs.
    let agent: Agent | undefined;
    const perRequestFetchOptions: RequestInit = { ...fetchOptions };
    if (currentResolvedIPs?.length) {
      agent = createPinnedAgent(currentResolvedIPs);
      // Node.js global fetch (undici) supports the dispatcher option at runtime.
      (perRequestFetchOptions as Record<string, unknown>).dispatcher = agent;
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, perRequestFetchOptions);
    } finally {
      // Close the single-use agent to release its connection pool.
      await agent?.close();
    }

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
        // The validator returns the resolved IPs so the next hop can pin DNS.
        const resolvedIPs = await redirectOptions.redirectValidation.validateUrl(
          redirectUrl,
          redirectOptions.redirectValidation.whitelist,
        );
        currentResolvedIPs = useIPPinning ? resolvedIPs : undefined;
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
    } else {
      currentResolvedIPs = undefined;
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
