import { createHash, randomBytes, randomInt, randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { afterEach, describe, expect, it, vi } from "vitest";

// The EmailProvider is only registered when SMTP is configured, and the
// provider list is built when `@/src/server/auth` is first imported. Set the
// variables before any import so `GET /api/auth/callback/email` resolves to a
// real provider instead of a "provider not found" redirect.
vi.hoisted(() => {
  process.env.SMTP_CONNECTION_URL = "smtp://localhost:1025";
  process.env.EMAIL_FROM_ADDRESS = "noreply@example.com";
});

import { env } from "@/src/env.mjs";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FAILED_MESSAGE,
} from "@/src/features/auth/constants";
import {
  hashPassword,
  verifyPassword,
} from "@/src/features/auth-credentials/lib/passwordHash";
import { verifyTurnstileToken } from "@/src/features/auth/server/verifyTurnstile";
import type * as VerifyTurnstileModule from "@/src/features/auth/server/verifyTurnstile";
import auth from "@/src/pages/api/auth/[...nextauth]";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { getAuthOptions } from "@/src/server/auth";
import { getCookieName } from "@/src/server/utils/cookies";
import { prisma } from "@langfuse/shared/src/db";

vi.mock(
  "@/src/features/auth/server/verifyTurnstile",
  async (importOriginal) => {
    const actual = await importOriginal<typeof VerifyTurnstileModule>();
    return {
      ...actual,
      verifyTurnstileToken: vi.fn(actual.verifyTurnstileToken),
    };
  },
);

const OLD_PASSWORD = "Oldpass1!";
const NEW_PASSWORD = "Newpass1!";

describe("GET /api/auth/callback/email", () => {
  it("does not create a session or consume the code; the code still resets the password", async () => {
    const { userId, email } = await createUser({ password: OLD_PASSWORD });
    const token = uniqueOtp();
    await insertOtp({ email, token });

    const res = await callEmailCallback({ email, token });

    expect(res.statusCode).toBe(302);
    expect(getHeaderText(res, "Location")).toContain("error=Verification");
    expect(getHeaderText(res, "Set-Cookie")).not.toMatch(
      /session-token=[^;\s]+/,
    );
    await expect(findOtp({ email, token })).resolves.not.toBeNull();

    const ctx = createInnerTRPCContext({ session: null, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });
    await caller.credentials.resetPassword({
      email,
      token,
      password: NEW_PASSWORD,
    });

    await expectPassword(userId, NEW_PASSWORD);
    await expect(findOtp({ email, token })).resolves.toBeNull();
  });

  it("does not log in an account that never set a password", async () => {
    const { email } = await createUser({ password: null });
    const token = uniqueOtp();
    await insertOtp({ email, token });

    const res = await callEmailCallback({ email, token });

    expect(res.statusCode).toBe(302);
    expect(getHeaderText(res, "Location")).toContain("error=Verification");
    expect(getHeaderText(res, "Set-Cookie")).not.toMatch(
      /session-token=[^;\s]+/,
    );
    await expect(findOtp({ email, token })).resolves.not.toBeNull();
  });

  it("does not consume other outstanding codes on a wrong guess", async () => {
    const { email } = await createUser({ password: OLD_PASSWORD });
    const token = uniqueOtp();
    await insertOtp({ email, token });

    const res = await callEmailCallback({ email, token: "000000" });

    expect(getHeaderText(res, "Location")).toContain("error=Verification");
    await expect(findOtp({ email, token })).resolves.not.toBeNull();
  });
});

describe("NextAuth signIn callback for the email provider", () => {
  it("allows the send request but rejects the consume request", async () => {
    const { email } = await createUser({ password: OLD_PASSWORD });
    const authOptions = await getAuthOptions(undefined, {
      turnstileToken: "reset-token",
      turnstileRemoteIp: "203.0.113.5",
    });
    const signIn = authOptions.callbacks!.signIn!;
    const user = { id: email, email };
    const account = {
      provider: "email",
      type: "email" as const,
      providerAccountId: email,
    };

    await expect(
      signIn({ user, account, email: { verificationRequest: true } }),
    ).resolves.toBe(true);
    expect(verifyTurnstileToken).toHaveBeenCalledWith({
      token: "reset-token",
      action: TURNSTILE_ACTIONS.passwordReset,
      remoteIp: "203.0.113.5",
    });

    vi.mocked(verifyTurnstileToken).mockClear();
    await expect(signIn({ user, account })).resolves.toBe(false);
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
  });

  it("clears the account's earlier codes and all expired codes before a new code is sent", async () => {
    const { email } = await createUser({ password: OLD_PASSWORD });
    const earlierToken = uniqueOtp();
    await insertOtp({ email, token: earlierToken });
    const expiredEmail = `expired-${randomUUID()}@example.com`;
    const expiredToken = uniqueOtp();
    await insertOtp({
      email: expiredEmail,
      token: expiredToken,
      expires: new Date(Date.now() - 1000),
    });
    const otherEmail = `other-${randomUUID()}@example.com`;
    const otherToken = uniqueOtp();
    await insertOtp({ email: otherEmail, token: otherToken });

    const authOptions = await getAuthOptions(undefined, {
      turnstileToken: "reset-token",
    });
    await expect(
      authOptions.callbacks!.signIn!({
        user: { id: email, email },
        account: {
          provider: "email",
          type: "email",
          providerAccountId: email,
        },
        email: { verificationRequest: true },
      }),
    ).resolves.toBe(true);

    await expect(findOtp({ email, token: earlierToken })).resolves.toBeNull();
    await expect(
      findOtp({ email: expiredEmail, token: expiredToken }),
    ).resolves.toBeNull();
    await expect(
      findOtp({ email: otherEmail, token: otherToken }),
    ).resolves.not.toBeNull();
  });

  it("rejects the reset-email request when captcha verification fails", async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false);
    const authOptions = await getAuthOptions(undefined, {
      turnstileToken: "bad-token",
    });
    const signIn = authOptions.callbacks!.signIn!;

    await expect(
      signIn({
        user: { id: "nobody@example.com", email: "nobody@example.com" },
        account: {
          provider: "email",
          type: "email",
          providerAccountId: "nobody@example.com",
        },
        email: { verificationRequest: true },
      }),
    ).rejects.toThrow(TURNSTILE_FAILED_MESSAGE);
  });
});

describe("NextAuth OAuth staff email verification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { name: "verified Google email", verified: true, expected: true },
    { name: "unverified Google email", verified: false, expected: false },
    { name: "missing ownership proof", verified: undefined, expected: false },
    {
      name: "different verified email",
      verified: true,
      mismatch: true,
      expected: false,
    },
    {
      name: "non-staff email",
      verified: true,
      domain: "example.com",
      expected: false,
    },
    {
      name: "credentials login",
      verified: true,
      credentials: true,
      expected: false,
    },
  ])("accepts only matching staff ownership proof: $name", async (testCase) => {
    const { userId, email } = await createUser({
      password: null,
      emailDomain: "domain" in testCase ? testCase.domain : "langfuse.com",
    });
    const authOptions = await getAuthOptions();
    await authOptions.callbacks!.jwt!({
      token: { email },
      user: { id: userId, email },
      account: {
        provider: "credentials" in testCase ? "credentials" : "google",
        type: "credentials" in testCase ? "credentials" : "oauth",
        providerAccountId: userId,
      },
      profile: {
        email:
          "mismatch" in testCase ? "someone@example.com" : email.toUpperCase(),
        ...{ email_verified: testCase.verified },
      },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerified !== null).toBe(testCase.expected);
    expect(user.admin).toBe(false);
  });

  it.each(["github", "langfuse.com.github"])(
    "verifies %s ownership and skips the lookup after verification",
    async (provider) => {
      const { userId, email } = await createUser({
        password: null,
        emailDomain: "langfuse.com",
      });
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(
          Response.json([{ email: email.toUpperCase(), verified: true }]),
        );
      const authOptions = await getAuthOptions();
      const args = {
        token: { email },
        user: { id: userId, email },
        account: {
          provider,
          type: "oauth" as const,
          providerAccountId: userId,
          access_token: "test-oauth-token",
        },
        profile: { email },
      };
      await authOptions.callbacks!.jwt!(args);
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user.emailVerified).toBeInstanceOf(Date);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/user/emails",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-oauth-token",
          }),
          redirect: "error",
          signal: expect.any(AbortSignal),
        }),
      );
      fetchMock.mockClear();
      await authOptions.callbacks!.jwt!({ ...args, user });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["unverified", "different-email", "failed-lookup"])(
    "keeps login working without verifying GitHub ownership on %s",
    async (scenario) => {
      const { userId, email } = await createUser({
        password: null,
        emailDomain: "clickhouse.com",
      });
      const fetchMock = vi.spyOn(globalThis, "fetch");
      if (scenario === "failed-lookup")
        fetchMock.mockRejectedValue(new Error("lookup failed"));
      else
        fetchMock.mockResolvedValue(
          Response.json([
            {
              email:
                scenario === "different-email" ? "someone@example.com" : email,
              verified: scenario !== "unverified",
            },
          ]),
        );
      const authOptions = await getAuthOptions();
      await expect(
        authOptions.callbacks!.jwt!({
          token: { email },
          user: { id: userId, email },
          account: {
            provider: "github",
            type: "oauth",
            providerAccountId: userId,
            access_token: "test-oauth-token",
          },
          profile: { email },
        }),
      ).resolves.toMatchObject({ email });
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(user.emailVerified).toBeNull();
    },
  );
});

describe("POST /api/auth/signin/email captcha", () => {
  it("passes the posted token to Turnstile and does not store a code when it fails", async () => {
    const { email } = await createUser({ password: OLD_PASSWORD });
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false);
    const { csrfToken, cookie } = csrfPair();

    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: {
        host: "localhost:3000",
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      },
      query: { nextauth: ["signin", "email"] },
      body: {
        email,
        csrfToken,
        callbackUrl: "http://localhost:3000/auth/reset-password",
        json: "true",
        turnstileToken: "posted-token",
      },
    });
    req.cookies = {
      [getCookieName("next-auth.csrf-token")]: cookie,
    };

    await auth(req, res);

    expect(verifyTurnstileToken).toHaveBeenCalledWith({
      token: "posted-token",
      action: TURNSTILE_ACTIONS.passwordReset,
      remoteIp: "203.0.113.9",
    });
    expect(res.statusCode).toBe(200);
    const url = res._getJSONData().url as string;
    expect(new URL(url).searchParams.get("error")).toContain(
      TURNSTILE_FAILED_MESSAGE,
    );
    await expect(
      prisma.verificationToken.findFirst({ where: { identifier: email } }),
    ).resolves.toBeNull();
  });
});

function csrfPair() {
  const csrfToken = randomBytes(32).toString("hex");
  const csrfTokenHash = createHash("sha256")
    .update(`${csrfToken}${process.env.NEXTAUTH_SECRET ?? ""}`)
    .digest("hex");
  return { csrfToken, cookie: `${csrfToken}|${csrfTokenHash}` };
}

function uniqueOtp() {
  return randomInt(100000, 1000000).toString();
}

function hashEmailOtpToken(token: string) {
  return createHash("sha256")
    .update(`${token}${env.NEXTAUTH_SECRET ?? ""}`)
    .digest("hex");
}

async function callEmailCallback({
  email,
  token,
}: {
  email: string;
  token: string;
}) {
  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: "GET",
    headers: { host: "localhost:3000" },
    query: { nextauth: ["callback", "email"], token, email },
  });
  req.cookies = {};

  await auth(req, res);

  return res;
}

function getHeaderText(res: NextApiResponse, name: string) {
  const value = res.getHeader(name);
  return Array.isArray(value) ? value.join("\n") : String(value ?? "");
}

async function insertOtp({
  email,
  token,
  expires = new Date(Date.now() + 3 * 60 * 1000),
}: {
  email: string;
  token: string;
  expires?: Date;
}) {
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashEmailOtpToken(token),
      expires,
    },
  });
}

function findOtp({ email, token }: { email: string; token: string }) {
  return prisma.verificationToken.findUnique({
    where: {
      identifier_token: { identifier: email, token: hashEmailOtpToken(token) },
    },
  });
}

async function expectPassword(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { password: true },
  });
  expect(await verifyPassword(password, user.password!)).toBe(true);
}

async function createUser({
  password,
  emailDomain = "example.com",
}: {
  password: string | null;
  emailDomain?: string;
}) {
  const id = randomUUID();
  const email = `user-${id}@${emailDomain}`;
  const user = await prisma.user.create({
    data: {
      id: `user-${id}`,
      email,
      name: "Email Callback Test User",
      password: password === null ? null : await hashPassword(password),
    },
  });
  return { userId: user.id, email };
}
