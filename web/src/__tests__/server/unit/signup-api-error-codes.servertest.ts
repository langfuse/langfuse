import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const { env, mockCreateUserEmailPassword } = vi.hoisted(() => ({
  env: {
    NEXT_PUBLIC_SIGN_UP_DISABLED: undefined as string | undefined,
    AUTH_DISABLE_SIGNUP: undefined as string | undefined,
    AUTH_DISABLE_USERNAME_PASSWORD: undefined as string | undefined,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: undefined as string | undefined,
  },
  mockCreateUserEmailPassword: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env }));

vi.mock("@/src/features/auth-credentials/lib/credentialsServerUtils", () => ({
  createUserEmailPassword: mockCreateUserEmailPassword,
}));

vi.mock("@/src/features/auth-credentials/lib/credentialsUtils", () => ({
  isEmailVerificationRequired: () => false,
}));

vi.mock("@/src/features/auth/lib/signupAttribution", () => ({
  getAdClickIdsFromRequest: () => undefined,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  getSsoAuthProviderIdForDomain: vi.fn().mockResolvedValue(null),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: { debug: vi.fn(), warn: vi.fn() },
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
}));

import { signupApiHandler } from "@/src/features/auth-credentials/server/signupApiHandler";

const validSignup = {
  email: "jane@example.com",
  name: "Jane Doe",
  password: "P@ssw0rd!",
};

describe("POST /api/auth/signup error codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.NEXT_PUBLIC_SIGN_UP_DISABLED = undefined;
    env.AUTH_DISABLE_SIGNUP = undefined;
    env.AUTH_DISABLE_USERNAME_PASSWORD = undefined;
    env.AUTH_DOMAINS_WITH_SSO_ENFORCEMENT = undefined;
  });

  it("returns a stable code when signup is disabled", async () => {
    env.NEXT_PUBLIC_SIGN_UP_DISABLED = "true";
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: validSignup,
    });

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._getJSONData()).toEqual({
      code: "SIGNUP_DISABLED",
      message: "Sign up is disabled.",
    });
  });

  it("returns a stable code when the account already exists", async () => {
    mockCreateUserEmailPassword.mockRejectedValue(
      new Error("User with email already exists. Please sign in."),
    );
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: validSignup,
    });

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._getJSONData()).toEqual({
      code: "ACCOUNT_EXISTS",
      message:
        "Signup: Error creating user: User with email already exists. Please sign in.",
    });
  });
});
