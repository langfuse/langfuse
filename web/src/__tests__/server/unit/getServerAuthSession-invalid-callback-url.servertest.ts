import type { NextApiRequest, NextApiResponse } from "next";
import { NextRequest } from "next/server";
import type * as NextAuth from "next-auth";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCookieName } from "@/src/server/utils/cookies";

const { mockGetServerSession } = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import {
  getAuthOptions,
  getServerAuthSession,
  getServerAuthSessionForRequest,
} from "@/src/server/auth";

const callbackUrlCookieName = getCookieName("next-auth.callback-url");
const originalNextAuthSecret = process.env.NEXTAUTH_SECRET;

const assertSanitizedRequest = (request: {
  cookies?: Partial<Record<string, string>>;
}) => {
  expect(request.cookies?.[callbackUrlCookieName]).toBeUndefined();
  expect(request.cookies?.["next-auth.session-token"]).toBe("valid-token");
};

describe("getServerAuthSession invalid callback URL handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockImplementation(async (request) => {
      assertSanitizedRequest(request);
      return null;
    });
  });

  afterEach(() => {
    if (originalNextAuthSecret === undefined) {
      delete process.env.NEXTAUTH_SECRET;
    } else {
      process.env.NEXTAUTH_SECRET = originalNextAuthSecret;
    }
  });

  it("removes an invalid callback-url cookie before calling next-auth", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
    });
    req.cookies = {
      [callbackUrlCookieName]: "nslookup -q=cname scanner.example",
      "next-auth.session-token": "valid-token",
    };

    await expect(getServerAuthSession({ req, res })).resolves.toBeNull();

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
  });

  it("removes an invalid callback-url cookie from an App Router request", async () => {
    const { getServerSession: realGetServerSession } =
      await vi.importActual<typeof NextAuth>("next-auth");
    process.env.NEXTAUTH_SECRET = "test-secret";
    mockGetServerSession.mockImplementation((request, response, options) => {
      assertSanitizedRequest(request);
      return realGetServerSession(request, response, options);
    });

    const request = new NextRequest("http://localhost/api/in-app-agent", {
      headers: {
        cookie: `${callbackUrlCookieName}=nslookup -q=cname scanner.example; next-auth.session-token=valid-token`,
      },
    });

    await expect(getServerAuthSessionForRequest(request)).resolves.toBeNull();

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
  });

  it("sanitizes an invalid callback-url cookie from a raw cookie header", async () => {
    const request = new Request("http://localhost/api/in-app-agent", {
      headers: {
        cookie: `${callbackUrlCookieName}=nslookup -q=cname scanner.example; next-auth.session-token=valid-token`,
      },
    });

    await expect(getServerAuthSessionForRequest(request)).resolves.toBeNull();

    expect(mockGetServerSession).toHaveBeenCalledTimes(1);
  });

  it("falls back to the base URL for a malformed redirect callback URL", async () => {
    const authOptions = await getAuthOptions();
    const redirect = authOptions.callbacks?.redirect;
    if (!redirect) throw new Error("Expected a redirect callback");

    expect(
      redirect({
        url: "/project/test\r\nscanner-payload",
        baseUrl: "http://localhost:3000",
      }),
    ).toBe("http://localhost:3000");
  });
});
