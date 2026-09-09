import { getAuthOptions } from "@/src/server/auth";
import { getAdClickIdsFromRequest } from "@/src/features/auth/lib/signupAttribution";
import { getCookieName } from "@/src/server/utils/cookies";
import { isValidCallbackUrl } from "@/src/server/utils/nextAuthCallbackUrl";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";

const maxAuthErrorLength = 1_000;
const authErrorFallback = "Configuration";

type AuthErrorSource = "query" | "path";
type CallbackUrlInputSource = "query" | "cookie";

const getCallbackUrlValueType = (value: unknown) =>
  Array.isArray(value) ? "array" : typeof value;

// Single parse of the [...nextauth] catch-all: [action, provider], e.g.
// /api/auth/callback/credentials -> ["callback", "credentials"].
const getNextAuthSegments = (
  req: NextApiRequest,
): [string | undefined, string | undefined] => {
  const nextauth = req.query.nextauth;
  return Array.isArray(nextauth)
    ? [nextauth[0], nextauth[1]]
    : [nextauth, undefined];
};

const logAuthErrorFallback = (
  reason: "invalid_type" | "too_long" | "encoding_failed",
  source: AuthErrorSource,
  metadata: Record<string, unknown>,
) => {
  logger.warn("[NEXT_AUTH] Replaced malformed auth error with Configuration", {
    reason,
    source,
    ...metadata,
  });
  return authErrorFallback;
};

const encodeAuthError = (error: unknown, source: AuthErrorSource) => {
  if (typeof error !== "string") {
    return logAuthErrorFallback("invalid_type", source, {
      errorType: Array.isArray(error) ? "array" : typeof error,
    });
  }

  if (error.length > maxAuthErrorLength) {
    return logAuthErrorFallback("too_long", source, {
      errorLength: error.length,
    });
  }

  try {
    return encodeURIComponent(error);
  } catch {
    return logAuthErrorFallback("encoding_failed", source, {
      errorLength: error.length,
    });
  }
};

export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  const [nextAuthAction, nextAuthProvider] = getNextAuthSegments(req);

  // Workaround for corporate email link checkers (e.g., Outlook SafeLink)
  // https://next-auth.js.org/tutorials/avoid-corporate-link-checking-email-provider
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  // next-auth answers non-POST requests to the credentials callback with a
  // bare, unlogged 500, so scanners probing this URL page our error-rate
  // monitors. Reject them with a 405 before next-auth sees them.
  const isCredentialsCallback =
    nextAuthAction === "callback" && nextAuthProvider === "credentials";
  if (isCredentialsCallback && req.method !== "POST") {
    logger.warn(
      `[NEXT_AUTH] Rejected ${req.method} to credentials callback with 405`,
    );
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // next-auth rejects malformed callbackUrl values (query param or cookie)
  // with a hardcoded 500 (`{ message }` JSON, no `url`). Vulnerability
  // scanners probing auth routes would page our server-error monitors, and
  // next-auth's client `signIn({ redirect: false })` then throws
  // `new URL(undefined)` on that body. Falsy values are treated as absent
  // because next-auth's assertConfig checks truthiness.
  //
  // Always strip an invalid callback-url COOKIE (stale browser state; the
  // credentials POST sends callbackUrl in the body). For GET HTML page
  // actions, also strip an invalid query param and let next-auth render.
  // Other actions keep the 400 boundary for an invalid QUERY callbackUrl
  // (scanner probes).
  const rendersHtmlErrorPage =
    req.method === "GET" &&
    ["signin", "signout", "error", "verify-request"].includes(
      nextAuthAction ?? "",
    );
  const callbackUrlCookieName = getCookieName("next-auth.callback-url");
  const callbackUrlParam = req.query.callbackUrl;
  const callbackUrlCookie = req.cookies[callbackUrlCookieName];
  const invalidCallbackUrlParam =
    Boolean(callbackUrlParam) && !isValidCallbackUrl(callbackUrlParam);
  const invalidCallbackUrlCookie =
    Boolean(callbackUrlCookie) && !isValidCallbackUrl(callbackUrlCookie);

  const logInvalidCallbackUrl = (
    inputSource: CallbackUrlInputSource,
    value: unknown,
  ) => {
    logger.warn("[NEXT_AUTH] Invalid callback URL", {
      action: nextAuthAction,
      path: req.url?.split("?")[0]?.slice(0, 200),
      inputSource,
      valueType: getCallbackUrlValueType(value),
    });
  };

  if (invalidCallbackUrlParam) {
    logInvalidCallbackUrl("query", callbackUrlParam);
  }
  if (invalidCallbackUrlCookie) {
    logInvalidCallbackUrl("cookie", callbackUrlCookie);
    const {
      [callbackUrlCookieName]: _invalidCallbackUrl,
      ...sanitizedCookies
    } = req.cookies;
    req.cookies = sanitizedCookies;
  }

  if (rendersHtmlErrorPage) {
    if (invalidCallbackUrlParam) {
      const { callbackUrl: _invalidCallbackUrl, ...sanitizedQuery } = req.query;
      req.query = sanitizedQuery;
    }
  } else if (invalidCallbackUrlParam) {
    return res.status(400).json({ message: "Invalid callback URL" });
  }

  // Intercept OAuth callback errors to preserve error_description from IdP
  // This happens before NextAuth processes the callback, allowing us to preserve
  // the IdP's error_description which NextAuth would otherwise strip
  // Only intercept if this is an OAuth callback request (path starts with 'callback')
  const isCallbackRequest = nextAuthAction === "callback";

  if (
    isCallbackRequest &&
    req.query.error &&
    req.query.error_description &&
    typeof req.query.error === "string" &&
    typeof req.query.error_description === "string"
  ) {
    const error = req.query.error;
    const errorDescription = req.query.error_description;
    const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";

    // Redirect directly to sign-in with error and error_description preserved
    // This bypasses NextAuth's error page which strips error_description
    return res.redirect(
      `${basePath}/auth/sign-in?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(errorDescription)}`,
    );
  }

  // Do whatever you want here, before the request is passed down to `NextAuth`
  // Pass Google Ads click attribution from first-party cookies so that new
  // SSO signups can be attributed to ad clicks (cloud_signup_complete event).
  const authOptions = await getAuthOptions({
    adClickIds: getAdClickIdsFromRequest(req),
  });
  // https://github.com/nextauthjs/next-auth/issues/2408#issuecomment-1382629234
  // for api routes, we need to call the headers in the api route itself
  // disable caching for anything auth related
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  // NextAuth interpolates unknown error values directly into a Location
  // header. Encode user-controlled text before it reaches that code path so
  // control characters cannot make Node throw ERR_INVALID_CHAR.
  if (nextAuthAction === "error") {
    const error = req.query.error ?? nextAuthProvider;
    if (error !== undefined) {
      const source = req.query.error !== undefined ? "query" : "path";
      req.query.error = encodeAuthError(error, source);
    }
  }

  return await NextAuth(req, res, authOptions);
}
