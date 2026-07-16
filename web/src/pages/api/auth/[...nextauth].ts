import { getAuthOptions } from "@/src/server/auth";
import { getCookieName } from "@/src/server/utils/cookies";
import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import type { NextApiRequest, NextApiResponse } from "next";
import NextAuth from "next-auth";

// Mirrors next-auth's assertConfig check (core/lib/assert.ts). Must never be
// stricter than next-auth: relative URLs always pass (next-auth resolves them
// against the deployment origin), absolute URLs must parse with an http(s)
// scheme.
const isValidCallbackUrl = (url: unknown): boolean => {
  if (typeof url !== "string") return false;
  try {
    return /^https?:/.test(
      new URL(url, url.startsWith("/") ? "http://localhost" : undefined)
        .protocol,
    );
  } catch {
    return false;
  }
};

export default async function auth(req: NextApiRequest, res: NextApiResponse) {
  // Workaround for corporate email link checkers (e.g., Outlook SafeLink)
  // https://next-auth.js.org/tutorials/avoid-corporate-link-checking-email-provider
  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  // next-auth rejects malformed callbackUrl values (query param or cookie)
  // with a hardcoded 500, so vulnerability scanners probing auth routes page
  // our server-error monitors. Malformed client input is a 4xx; reject it
  // before next-auth sees it.
  const callbackUrlParam = req.query.callbackUrl;
  const callbackUrlCookie =
    req.cookies[getCookieName("next-auth.callback-url")];
  const invalidCallbackUrl =
    (callbackUrlParam !== undefined && !isValidCallbackUrl(callbackUrlParam)) ||
    (callbackUrlCookie !== undefined && !isValidCallbackUrl(callbackUrlCookie));
  if (invalidCallbackUrl) {
    logger.warn("[NEXT_AUTH] Rejected invalid callback URL", {
      callbackUrlParam: String(callbackUrlParam).slice(0, 200),
      callbackUrlCookie: String(callbackUrlCookie).slice(0, 200),
      path: req.url?.slice(0, 200),
    });
    return res.status(400).json({ message: "Invalid callback URL" });
  }

  // Intercept OAuth callback errors to preserve error_description from IdP
  // This happens before NextAuth processes the callback, allowing us to preserve
  // the IdP's error_description which NextAuth would otherwise strip
  // Only intercept if this is an OAuth callback request (path starts with 'callback')
  const isCallbackRequest =
    Array.isArray(req.query.nextauth) &&
    req.query.nextauth.length > 0 &&
    req.query.nextauth[0] === "callback";

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
  const authOptions = await getAuthOptions();
  // https://github.com/nextauthjs/next-auth/issues/2408#issuecomment-1382629234
  // for api routes, we need to call the headers in the api route itself
  // disable caching for anything auth related
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  return await NextAuth(req, res, authOptions);
}
