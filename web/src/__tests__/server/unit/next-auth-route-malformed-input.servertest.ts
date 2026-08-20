import { validateHeaderValue } from "node:http";

import type { NextApiRequest, NextApiResponse } from "next";
import type { NextAuthOptions } from "next-auth";
import { createMocks } from "node-mocks-http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetAuthOptions, mockLoggerWarn } = vi.hoisted(() => ({
  mockGetAuthOptions: vi.fn(),
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({
  getAuthOptions: mockGetAuthOptions,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
  ClickHouseClientManager: {
    getInstance: () => ({
      closeAllConnections: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXTAUTH_URL: "http://localhost:3000",
    NEXT_PUBLIC_BASE_PATH: "",
    NEXTAUTH_COOKIE_DOMAIN: undefined,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    NEXTAUTH_COOKIE_NAME_SUFFIX: undefined,
  },
}));

import auth from "@/src/pages/api/auth/[...nextauth]";

const authOptions: NextAuthOptions = {
  secret: "test-secret",
  providers: [],
  cookies: {
    callbackUrl: {
      name: "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
  },
  pages: {
    error: "/auth/error",
    signIn: "/auth/sign-in",
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      try {
        if (url.startsWith("/")) return `${baseUrl}${url}`;
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // Match the application callback that safely handles malformed POST
        // body callbackUrl values. Query and cookie validation happens before
        // NextAuth invokes this callback.
      }
      return baseUrl;
    },
  },
};

function createRequest({
  nextauth,
  query = {},
  cookies = {},
}: {
  nextauth: string[];
  query?: Record<string, string | string[]>;
  cookies?: Record<string, string>;
}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    headers: { host: "localhost:3000" },
    query: { nextauth, ...query },
  });
  req.cookies = cookies;

  // node-mocks-http accepts control characters in headers while a real
  // ServerResponse rejects them. Keep the lightweight Next.js response mock,
  // but apply Node's production header validation to every setHeader call.
  const setHeader = res.setHeader.bind(res);
  vi.spyOn(res, "setHeader").mockImplementation((name, value) => {
    for (const item of Array.isArray(value) ? value : [value]) {
      validateHeaderValue(name, String(item));
    }
    return setHeader(name, value);
  });

  return { req, res };
}

describe("NextAuth error route malformed input handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthOptions.mockResolvedValue(authOptions);
  });

  it("redirects a supported auth error without returning a 5xx", async () => {
    const { req, res } = createRequest({
      nextauth: ["error"],
      query: { error: "OAuthCallback" },
    });

    await auth(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe(
      "http://localhost:3000/api/auth/signin?error=OAuthCallback",
    );
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("does not throw when an auth error contains invalid Location header characters", async () => {
    const { req, res } = createRequest({
      nextauth: ["error"],
      query: { error: "configuration\r\nscanner-payload" },
    });

    await expect(auth(req, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe(
      "/auth/error?error=configuration%0D%0Ascanner-payload",
    );
  });

  it("does not throw when the auth error path segment contains invalid Location header characters", async () => {
    const { req, res } = createRequest({
      nextauth: ["error", "configuration\r\nscanner-payload"],
    });

    await expect(auth(req, res)).resolves.toBeUndefined();
    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe(
      "/auth/error?error=configuration%0D%0Ascanner-payload",
    );
  });

  it("uses a generic error for an ambiguous array-valued error", async () => {
    const { req, res } = createRequest({
      nextauth: ["error"],
      query: { error: ["OAuthCallback", "scanner-payload"] },
    });

    await auth(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe("/auth/error?error=Configuration");
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[NEXT_AUTH] Replaced malformed auth error with Configuration",
      {
        reason: "invalid_type",
        source: "query",
        errorType: "array",
      },
    );
  });

  it("logs when an oversized error uses the generic fallback", async () => {
    const error = "a".repeat(1_001);
    const { req, res } = createRequest({
      nextauth: ["error"],
      query: { error },
    });

    await auth(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe("/auth/error?error=Configuration");
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[NEXT_AUTH] Replaced malformed auth error with Configuration",
      {
        reason: "too_long",
        source: "query",
        errorLength: error.length,
      },
    );
  });

  it("logs the path source when an unencodable error uses the generic fallback", async () => {
    const error = "\uD800";
    const { req, res } = createRequest({
      nextauth: ["error", error],
    });

    await auth(req, res);

    expect(res.statusCode).toBe(302);
    expect(res.getHeader("Location")).toBe("/auth/error?error=Configuration");
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      "[NEXT_AUTH] Replaced malformed auth error with Configuration",
      {
        reason: "encoding_failed",
        source: "path",
        errorLength: error.length,
      },
    );
  });
});
