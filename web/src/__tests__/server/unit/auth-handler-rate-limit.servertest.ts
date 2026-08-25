import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const {
  mockApplyAuthRateLimit,
  mockNextAuth,
  mockGetAuthOptions,
  mockCreateUserEmailPassword,
} = vi.hoisted(() => ({
  mockApplyAuthRateLimit: vi.fn(async () => false),
  mockNextAuth: vi.fn(async (_req: NextApiRequest, res: NextApiResponse) => {
    res.status(200).end();
  }),
  mockGetAuthOptions: vi.fn(async () => ({})),
  mockCreateUserEmailPassword: vi.fn(async () => "user-id"),
}));

vi.mock("@/src/features/auth-credentials/server/authRateLimit", () => ({
  applyAuthRateLimit: mockApplyAuthRateLimit,
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
    NEXT_PUBLIC_SIGN_UP_DISABLED: undefined,
    AUTH_DISABLE_SIGNUP: undefined,
    AUTH_DISABLE_USERNAME_PASSWORD: undefined,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: undefined,
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK: undefined,
  },
}));

vi.mock("@/src/features/auth-credentials/lib/credentialsServerUtils", () => ({
  createUserEmailPassword: mockCreateUserEmailPassword,
}));

vi.mock("@/src/features/auth-credentials/lib/credentialsUtils", () => ({
  isEmailVerificationRequired: () => false,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  getSsoAuthProviderIdForDomain: vi.fn(async () => null),
}));

import nextAuthHandler from "@/src/pages/api/auth/[...nextauth]";
import { signupApiHandler } from "@/src/features/auth-credentials/server/signupApiHandler";

describe("auth handlers apply rate limiting", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockApplyAuthRateLimit.mockResolvedValue(false);
  });

  it("rate-limits credentials login before NextAuth and skips NextAuth when limited", async () => {
    mockApplyAuthRateLimit.mockImplementation(async (_req, res) => {
      res
        .status(429)
        .json({ message: "Too many requests. Please retry in 3 seconds." });
      return true;
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { nextauth: ["callback", "credentials"] },
      body: { email: "user@example.com", password: "secret" },
    });
    await nextAuthHandler(req, res);

    expect(mockApplyAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "auth-login",
    );
    expect(res._getStatusCode()).toBe(429);
    expect(mockNextAuth).not.toHaveBeenCalled();
  });

  it("passes credentials login through to NextAuth when not limited", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      query: { nextauth: ["callback", "credentials"] },
      body: { email: "user@example.com", password: "secret" },
    });
    await nextAuthHandler(req, res);

    expect(mockApplyAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "auth-login",
    );
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("does not rate-limit non-credentials NextAuth routes", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { nextauth: ["session"] },
    });
    await nextAuthHandler(req, res);

    expect(mockApplyAuthRateLimit).not.toHaveBeenCalled();
    expect(mockNextAuth).toHaveBeenCalledTimes(1);
  });

  it("rate-limits signup before creating a user", async () => {
    mockApplyAuthRateLimit.mockImplementation(async (_req, res) => {
      res
        .status(429)
        .json({ message: "Too many requests. Please retry in 3 seconds." });
      return true;
    });

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "Password1!",
      },
    });
    await signupApiHandler(req, res);

    expect(mockApplyAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "auth-signup",
    );
    expect(res._getStatusCode()).toBe(429);
    expect(mockCreateUserEmailPassword).not.toHaveBeenCalled();
  });

  it("creates a user when signup is not rate limited", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: {
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "Password1!",
      },
    });
    await signupApiHandler(req, res);

    expect(mockApplyAuthRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "auth-signup",
    );
    expect(mockCreateUserEmailPassword).toHaveBeenCalledTimes(1);
    expect(res._getStatusCode()).toBe(200);
  });
});
