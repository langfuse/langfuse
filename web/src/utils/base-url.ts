import { env } from "@/src/env.mjs";

const LOCALHOST_HOST_PATTERN = /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i;

export const getBaseUrl = () => {
  const rawBaseUrl = env.NEXTAUTH_URL;

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
