import { validateHeaderValue } from "node:http";

type RequestWithCookieStore = Request & {
  cookies?: {
    getAll: () => Array<{ name: string; value: string }>;
  };
};

// Matches next-auth's URL/scheme check and also rejects values Node cannot
// safely place in a Location header. Relative URLs must start with `/`;
// absolute URLs must parse with an http(s) scheme.
export const isValidCallbackUrl = (url: unknown): boolean => {
  if (typeof url !== "string") return false;
  try {
    validateHeaderValue("Location", url);
    return /^https?:/.test(
      new URL(url, url.startsWith("/") ? "http://localhost" : undefined)
        .protocol,
    );
  } catch {
    return false;
  }
};

const parseCookieHeader = (cookieHeader: string | null) => {
  const cookies: Record<string, string> = {};

  for (const part of cookieHeader?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = part.slice(0, separatorIndex).trim();
    if (!name) continue;

    const value = part.slice(separatorIndex + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }

  return cookies;
};

export const getRequestCookies = (request: Request) => {
  const requestWithCookieStore = request as RequestWithCookieStore;
  if (requestWithCookieStore.cookies) {
    return Object.fromEntries(
      requestWithCookieStore.cookies
        .getAll()
        .map(({ name, value }) => [name, value]),
    );
  }

  return parseCookieHeader(request.headers.get("cookie"));
};
