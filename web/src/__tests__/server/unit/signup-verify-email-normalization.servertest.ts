const mockEnv = vi.hoisted(() => ({
  env: {
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK: undefined as string | undefined,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined as string | undefined,
  },
}));

vi.mock("@/src/env.mjs", () => mockEnv);

const {
  isEmailVerificationRequiredMock,
  validateSignupEligibilityMock,
  createProjectMembershipsOnSignupMock,
  findUniqueMock,
  createMock,
} = vi.hoisted(() => ({
  isEmailVerificationRequiredMock: vi.fn(),
  validateSignupEligibilityMock: vi.fn(),
  createProjectMembershipsOnSignupMock: vi.fn(),
  findUniqueMock: vi.fn(),
  createMock: vi.fn(),
}));

vi.mock("@/src/features/auth-credentials/lib/credentialsUtils", () => ({
  isEmailVerificationRequired: isEmailVerificationRequiredMock,
}));

vi.mock("@/src/features/auth-credentials/server/signupApiHandler", () => ({
  validateSignupEligibility: validateSignupEligibilityMock,
}));

vi.mock("@/src/features/auth/lib/createProjectMembershipsOnSignup", () => ({
  createProjectMembershipsOnSignup: createProjectMembershipsOnSignupMock,
}));

vi.mock("@/src/features/auth/lib/signupAttribution", () => ({
  getGclidFromRequest: vi.fn(() => undefined),
}));

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { user: { findUnique: findUniqueMock, create: createMock } },
}));

import handler from "@/src/pages/api/auth/signup-verify";
import { type NextApiRequest, type NextApiResponse } from "next";

const makeReqRes = (body: unknown) => {
  const json = vi.fn();
  const end = vi.fn();
  const status = vi.fn().mockReturnValue({ json, end });
  const req = {
    method: "POST",
    body,
    headers: {},
    cookies: {},
  } as unknown as NextApiRequest;
  const res = {
    status,
    setHeader: vi.fn(),
  } as unknown as NextApiResponse;
  return { req, res, status, json };
};

describe("POST /api/auth/signup-verify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isEmailVerificationRequiredMock.mockReturnValue(true);
    validateSignupEligibilityMock.mockResolvedValue(null);
    findUniqueMock.mockResolvedValue(null);
    createMock.mockResolvedValue({ id: "user-1" });
    createProjectMembershipsOnSignupMock.mockResolvedValue(undefined);
  });

  it("accepts a whitespace-padded email and normalizes it once (#15780)", async () => {
    const { req, res, status } = makeReqRes({
      email: "  User@Example.COM  ",
      name: "Jane Doe",
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(200);
    // The SSO-eligibility check, the duplicate lookup and the write must all
    // read the same normalized value, otherwise a trailing space could skip
    // domain-based SSO enforcement while still matching an account.
    expect(validateSignupEligibilityMock).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "user@example.com" }),
      }),
    );
  });

  it("treats a whitespace-padded duplicate as the same existing user (#15780)", async () => {
    findUniqueMock.mockResolvedValue({ id: "user-1", password: "hashed" });
    const { req, res, status, json } = makeReqRes({
      email: " existing@example.com ",
      name: "Jane Doe",
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(json).toHaveBeenCalledWith({
      message: "User with email already exists. Please sign in.",
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it("still rejects a value that is not an email", async () => {
    const { req, res, status } = makeReqRes({
      email: "not-an-email",
      name: "Jane Doe",
    });

    await handler(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(createMock).not.toHaveBeenCalled();
  });
});
