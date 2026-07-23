import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const { mockNextAuth, mockGetAuthOptions } = vi.hoisted(() => ({
  mockNextAuth: vi.fn(async (_req: unknown, res: any) => res.status(200).end()),
  mockGetAuthOptions: vi.fn(async () => ({})),
}));

vi.mock("next-auth", () => ({ default: mockNextAuth }));

vi.mock("@/src/server/auth", () => ({
  getAuthOptions: mockGetAuthOptions,
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
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

const callHandler = async (options: Parameters<typeof createMocks>[0] = {}) => {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    query: { nextauth: ["callback", "email"] },
    ...options,
  });
  await handler(req, res);
  return { req, res };
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

  it("rejects an invalid callback-url cookie with 400", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "z`z'z\"${{%{{\\" },
    });

    expect(res._getStatusCode()).toBe(400);
    expect(mockNextAuth).not.toHaveBeenCalled();
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
  });

  it("passes through a valid callback-url cookie", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "https://cloud.langfuse.com" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("passes through when no callbackUrl is present", async () => {
    const { res } = await callHandler();

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("passes through an empty callbackUrl query param (next-auth treats it as absent)", async () => {
    const { res } = await callHandler({
      query: { nextauth: ["callback", "email"], callbackUrl: "" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("passes through an empty callback-url cookie (next-auth treats it as absent)", async () => {
    const { res } = await callHandler({
      cookies: { "next-auth.callback-url": "" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("passes an invalid callbackUrl through on GET signin (next-auth redirects to its error page instead of 500ing)", async () => {
    const { res } = await callHandler({
      query: { nextauth: ["signin"], callbackUrl: "www.example.com/foo" },
    });

    expect(res._getStatusCode()).toBe(200);
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
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
