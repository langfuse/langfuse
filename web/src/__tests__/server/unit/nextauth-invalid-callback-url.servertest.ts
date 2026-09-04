import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

type NextAuthRequestSnapshot = Pick<NextApiRequest, "query" | "cookies">;

const {
  mockNextAuth,
  mockGetAuthOptions,
  mockLoggerWarn,
  mockNextAuthRequestSnapshot,
} = vi.hoisted(() => {
  const mockNextAuthRequestSnapshot =
    vi.fn<(snapshot: NextAuthRequestSnapshot) => void>();
  const mockNextAuth = vi.fn(
    async (req: NextApiRequest, res: NextApiResponse) => {
      mockNextAuthRequestSnapshot({
        query: Object.fromEntries(
          Object.entries(req.query).map(([key, value]) => [
            key,
            Array.isArray(value) ? [...value] : value,
          ]),
        ),
        cookies: { ...req.cookies },
      });
      res.status(200).end();
    },
  );

  return {
    mockNextAuth,
    mockGetAuthOptions: vi.fn(async () => ({})),
    mockLoggerWarn: vi.fn(),
    mockNextAuthRequestSnapshot,
  };
});

vi.mock("next-auth", () => ({ default: mockNextAuth }));

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
    NEXT_PUBLIC_BASE_PATH: undefined,
    NEXTAUTH_COOKIE_DOMAIN: undefined,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    NEXTAUTH_COOKIE_NAME_SUFFIX: undefined,
  },
}));

import handler from "@/src/pages/api/auth/[...nextauth]";

const callbackUrlCookieName = "next-auth.callback-url";

const getNextAuthRequest = (): NextAuthRequestSnapshot => {
  expect(mockNextAuthRequestSnapshot).toHaveBeenCalledTimes(1);
  return mockNextAuthRequestSnapshot.mock.calls[0]![0];
};

const callHandler = async (options: Parameters<typeof createMocks>[0] = {}) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { nextauth: ["callback", "email"] },
    ...options,
  });
  await handler(req, res);
  return { res };
};

describe("[...nextauth] invalid callbackUrl handling", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a SQL-injection callbackUrl query param with 400", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl:
          "'+convert(int, cast(0x5f21403264696c656d6d61 as varchar(8000)))+'",
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) scheme callbackUrl with 400", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl: "javascript:alert(1)",
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("rejects a repeated (array) callbackUrl query param with 400", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl: ["https://a.example.com", "https://b.example.com"],
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("rejects a callbackUrl containing decoded control characters", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl: "/project/test\r\nscanner-payload",
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("strips an invalid callback-url cookie and continues (does not 400)", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "z`z'z\"${{%{{\\" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().cookies[callbackUrlCookieName]).toBeUndefined();
  });

  it("strips an invalid callback-url cookie on POST credentials and continues", async () => {
    const { res } = await callHandler({
      method: "POST",
      query: { nextauth: ["callback", "credentials"] },
      cookies: { [callbackUrlCookieName]: "javascript:alert(1)" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().cookies[callbackUrlCookieName]).toBeUndefined();
  });

  it("passes through a valid absolute callbackUrl", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl: "https://cloud.langfuse.com/project/abc",
      },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().query.callbackUrl).toBe(
      "https://cloud.langfuse.com/project/abc",
    );
  });

  it("passes through a relative callbackUrl", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["callback", "email"],
        callbackUrl: "/project/abc",
      },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().query.callbackUrl).toBe("/project/abc");
  });

  it("passes through a valid callback-url cookie", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "https://cloud.langfuse.com" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().cookies[callbackUrlCookieName]).toBe(
      "https://cloud.langfuse.com",
    );
  });

  it("passes through when no callbackUrl is present", async () => {
    const { res } = await callHandler();

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().query.callbackUrl).toBeUndefined();
    expect(getNextAuthRequest().cookies[callbackUrlCookieName]).toBeUndefined();
  });

  it("passes through an empty callbackUrl query param (next-auth treats it as absent)", async () => {
    const { res } = await callHandler({
      query: { nextauth: ["callback", "email"], callbackUrl: "" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().query.callbackUrl).toBe("");
  });

  it("passes through an empty callback-url cookie (next-auth treats it as absent)", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().cookies[callbackUrlCookieName]).toBe("");
  });

  it("removes an invalid callbackUrl before passing GET signin to next-auth", async () => {
    const { res } = await callHandler({
      query: { nextauth: ["signin"], callbackUrl: "www.example.com/foo" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
    expect(getNextAuthRequest().query.callbackUrl).toBeUndefined();
  });

  it("removes invalid callbackUrl query and cookie independently before GET signin", async () => {
    const { res } = await callHandler({
      query: {
        nextauth: ["signin"],
        callbackUrl: ["https://evil.com", "/home"],
      },
      cookies: { [callbackUrlCookieName]: "https://evil.com%0d%0a" },
    });

    expect(res._getStatusCode()).toBe(200);
    const nextAuthRequest = getNextAuthRequest();
    expect(nextAuthRequest.query.callbackUrl).toBeUndefined();
    expect(nextAuthRequest.cookies[callbackUrlCookieName]).toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledTimes(2);

    const warningMetadata = mockLoggerWarn.mock.calls.map(
      ([message, metadata]) => {
        expect(message).toBe("[NEXT_AUTH] Invalid callback URL");
        expect(Object.keys(metadata).sort()).toEqual(
          ["action", "path", "inputSource", "valueType"].sort(),
        );
        expect(JSON.stringify(metadata)).not.toContain("evil.com");
        return metadata;
      },
    );
    expect(warningMetadata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "signin",
          inputSource: "query",
          valueType: "array",
        }),
        expect.objectContaining({
          action: "signin",
          inputSource: "cookie",
          valueType: "string",
        }),
      ]),
    );
  });

  it("rejects an invalid callbackUrl on POST signin with 400 (no HTML error-page carve-out for POST)", async () => {
    const { res } = await callHandler({
      method: "POST",
      query: {
        nextauth: ["signin", "email"],
        callbackUrl: "www.example.com/foo",
      },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });
});

describe("[...nextauth] credentials callback method guard", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a GET to the credentials callback with 405 and an Allow: POST header", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { nextauth: ["callback", "credentials"] },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res.getHeader("Allow")).toBe("POST");
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("rejects a PUT to the credentials callback with 405", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "PUT",
      query: { nextauth: ["callback", "credentials"] },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("passes a POST to the credentials callback through to next-auth", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { nextauth: ["callback", "credentials"] },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 for a HEAD to the credentials callback", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "HEAD",
      query: { nextauth: ["callback", "credentials"] },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });
});
