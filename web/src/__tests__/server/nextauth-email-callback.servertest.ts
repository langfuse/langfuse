import { createHash, randomInt, randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { createMocks } from "node-mocks-http";
import { describe, expect, it, vi } from "vitest";

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
  hashPassword,
  verifyPassword,
} from "@/src/features/auth-credentials/lib/credentialsServerUtils";
import auth from "@/src/pages/api/auth/[...nextauth]";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { getAuthOptions } from "@/src/server/auth";
import { prisma } from "@langfuse/shared/src/db";

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
    const authOptions = await getAuthOptions();
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
    await expect(signIn({ user, account })).resolves.toBe(false);
  });
});

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

async function insertOtp({ email, token }: { email: string; token: string }) {
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashEmailOtpToken(token),
      expires: new Date(Date.now() + 3 * 60 * 1000),
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

async function createUser({ password }: { password: string | null }) {
  const id = randomUUID();
  const email = `user-${id}@example.com`;
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
