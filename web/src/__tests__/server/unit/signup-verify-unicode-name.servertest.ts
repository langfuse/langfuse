import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";

const {
  mockCreateProjectMembershipsOnSignup,
  mockFindUnique,
  mockCreateUser,
  mockValidateSignupEligibility,
} = vi.hoisted(() => ({
  mockCreateProjectMembershipsOnSignup: vi.fn(),
  mockFindUnique: vi.fn(),
  mockCreateUser: vi.fn(),
  mockValidateSignupEligibility: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({ env: {} }));

vi.mock("@/src/features/auth-credentials/lib/credentialsUtils", () => ({
  isEmailVerificationRequired: () => true,
}));

vi.mock("@/src/features/auth-credentials/server/signupApiHandler", () => ({
  validateSignupEligibility: mockValidateSignupEligibility,
}));

vi.mock("@/src/features/auth/lib/createProjectMembershipsOnSignup", () => ({
  createProjectMembershipsOnSignup: mockCreateProjectMembershipsOnSignup,
}));

vi.mock("@/src/features/auth/lib/signupAttribution", () => ({
  getAdClickIdsFromRequest: () => undefined,
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    user: {
      findUnique: mockFindUnique,
      create: mockCreateUser,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  redis: null,
  logger: { debug: vi.fn(), warn: vi.fn() },
  ClickHouseClientManager: {
    getInstance: () => ({ closeAllConnections: vi.fn() }),
  },
}));

import handler from "@/src/pages/api/auth/signup-verify";

describe("POST /api/auth/signup-verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateSignupEligibility.mockResolvedValue(null);
    mockFindUnique.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({
      id: "user-1",
      email: "zhangsan@example.com",
      name: "张三",
    });
  });

  it("accepts a Chinese name supported by the signup form", async () => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email: "zhangsan@example.com", name: "张三" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockCreateUser).toHaveBeenCalledWith({
      data: {
        email: "zhangsan@example.com",
        password: null,
        name: "张三",
      },
    });
  });

  it("returns a stable eligibility error code", async () => {
    mockValidateSignupEligibility.mockResolvedValue({
      code: "SIGNUP_DISABLED",
      message: "Sign up is disabled.",
    });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email: "jane@example.com", name: "Jane Doe" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._getJSONData()).toEqual({
      code: "SIGNUP_DISABLED",
      message: "Sign up is disabled.",
    });
  });

  it("returns a stable code when the account already exists", async () => {
    mockFindUnique.mockResolvedValue({ password: "password-hash" });
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email: "jane@example.com", name: "Jane Doe" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res._getJSONData()).toEqual({
      code: "ACCOUNT_EXISTS",
      message: "User with email already exists. Please sign in.",
    });
  });
});
