import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextApiRequest, NextApiResponse } from "next";

const { createUserEmailPasswordMock, loggerWarnMock } = vi.hoisted(() => ({
  createUserEmailPasswordMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/src/env.mjs", () => ({
  env: {
    NEXT_PUBLIC_SIGN_UP_DISABLED: undefined,
    AUTH_DISABLE_SIGNUP: undefined,
    AUTH_DISABLE_USERNAME_PASSWORD: undefined,
    AUTH_DOMAINS_WITH_SSO_ENFORCEMENT: undefined,
    LANGFUSE_NEW_USER_SIGNUP_WEBHOOK: undefined,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: undefined,
    EMAIL_VERIFY_MODE: undefined,
  },
}));

vi.mock("@/src/features/auth-credentials/lib/credentialsServerUtils", () => ({
  createUserEmailPassword: createUserEmailPasswordMock,
}));

vi.mock("@/src/features/auth/lib/signupAttribution", () => ({
  getAdClickIdsFromRequest: () => ({}),
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  getSsoAuthProviderIdForDomain: vi.fn(async () => null),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: loggerWarnMock },
}));

import { signupApiHandler } from "@/src/features/auth-credentials/server/signupApiHandler";

function buildReqRes(body: unknown) {
  const req = {
    method: "POST",
    body,
  } as unknown as NextApiRequest;

  const res = {
    statusCode: 200,
    payload: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  } as unknown as NextApiResponse & {
    statusCode: number;
    payload: any;
  };

  return { req, res };
}

const validBody = {
  email: "user@example.com",
  password: "Str0ng&SecurePass!",
  name: "Test User",
};

describe("signupApiHandler error responses do not leak internals (#16504)", () => {
  beforeEach(() => {
    createUserEmailPasswordMock.mockReset();
    loggerWarnMock.mockReset();
  });

  it("passes through known validation messages", async () => {
    createUserEmailPasswordMock.mockRejectedValue(
      new Error("Password needs to be at least 8 characters long."),
    );
    const { req, res } = buildReqRes(validBody);

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.payload).toEqual({
      message: "Password needs to be at least 8 characters long.",
    });
  });

  it("passes through duplicate-account messages", async () => {
    createUserEmailPasswordMock.mockRejectedValue(
      new Error("User with email already exists. Please sign in."),
    );
    const { req, res } = buildReqRes(validBody);

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(422);
    expect(res.payload).toEqual({
      message: "User with email already exists. Please sign in.",
    });
  });

  it("replaces raw Prisma errors with a generic message", async () => {
    // Simulate what Prisma throws on a DB-level failure: table/column names
    // and query details inside the message.
    createUserEmailPasswordMock.mockRejectedValue(
      new Error(
        'Invalid `prisma.user.create()` invocation:\n\nUnique constraint failed on the constraint: `users_email_key`\n{"clientVersion":"5.22.0"}',
      ),
    );
    const { req, res } = buildReqRes(validBody);

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(422);
    const payload = res.payload as { message: string };
    expect(payload.message).not.toContain("prisma");
    expect(payload.message).not.toContain("users_email_key");
    expect(payload.message).toBe(
      "Signup failed. Please check your input and try again.",
    );
  });

  it("still logs the full error server-side", async () => {
    const internalDetail =
      'Invalid `prisma.user.create()` invocation:\n\nerror: column "x" does not exist';
    createUserEmailPasswordMock.mockRejectedValue(new Error(internalDetail));
    const { req, res } = buildReqRes(validBody);

    await signupApiHandler(req, res);

    expect(loggerWarnMock).toHaveBeenCalledTimes(1);
    const logged = String(loggerWarnMock.mock.calls[0][0]);
    expect(logged).toContain(internalDetail);
  });
});
