import { env } from "../../env";

const LOCALHOST_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i;

export const getBaseUrl = () => {
  // NextAuth.js falls back to VERCEL_URL when NEXTAUTH_URL is unset (mirrors
  // the preprocess in web/src/env.mjs).
  const rawBaseUrl = env.NEXTAUTH_URL || env.VERCEL_URL;

  if (!rawBaseUrl) {
    throw new Error(
      "NEXTAUTH_URL must be set to derive the Langfuse base URL.",
    );
  }

  return new URL(
    /^https?:\/\//i.test(rawBaseUrl)
      ? rawBaseUrl
      : `${LOCALHOST_HOST_PATTERN.test(rawBaseUrl) ? "http" : "https"}://${rawBaseUrl}`,
  );
};

export const getProductBaseUrl = () => {
  const baseUrl = getBaseUrl();

  baseUrl.pathname = baseUrl.pathname.replace(/\/api\/auth\/?$/, "/");
  baseUrl.search = "";
  baseUrl.hash = "";

  if (!baseUrl.pathname.endsWith("/")) {
    baseUrl.pathname = `${baseUrl.pathname}/`;
  }

  return baseUrl;
};
