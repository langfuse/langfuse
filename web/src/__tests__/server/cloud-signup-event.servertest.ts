import { createHash, randomBytes, randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type * as NextAuthModule from "next-auth";
import type { NextAuthOptions } from "next-auth";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, posthogShutdown, oauthProfile } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  posthogShutdown: vi.fn(),
  oauthProfile: { email: "" },
}));

// cloud_signup_complete's own client and the shared one both record here
vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  ServerPosthog: class {
    capture = captureMock;
    shutdown = posthogShutdown;
  },
  getServerPosthog: () => ({ capture: captureMock }),
}));

// Records each email code instead of sending it, so a test can read it.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedServerModule>()),
  sendResetPasswordVerificationRequest: vi.fn(),
}));

// Stands in for NextAuth's OAuth callback: it links the provider account to
// the user with that email, created first when there is none. Email code
// requests go to NextAuth itself.
vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof NextAuthModule>();
  return {
    ...actual,
    default: async (
      req: NextApiRequest,
      res: NextApiResponse,
      options: NextAuthOptions,
    ) => {
      const [action, provider] = req.query.nextauth as string[];
      if (action !== "callback") return actual.default(req, res, options);
      const adapter = options.adapter;
      if (
        !adapter?.createUser ||
        !adapter.linkAccount ||
        !adapter.getUserByEmail
      ) {
        throw new Error("NextAuth adapter without user and account methods");
      }
      const user =
        (await adapter.getUserByEmail(oauthProfile.email)) ??
        (await adapter.createUser({
          email: oauthProfile.email,
          emailVerified: null,
          name: "Jane Doe",
        }));
      await adapter.linkAccount({
        userId: user.id,
        type: "oauth",
        provider,
        providerAccountId: oauthProfile.email,
      });
      res.status(200).end();
    },
  };
});

import { env } from "@/src/env.mjs";
import { SIGNUP_EMAIL_CODE_MAX_AGE_SECONDS } from "@/src/features/auth-credentials/lib/credentialsUtils";
import { signupApiHandler } from "@/src/features/auth-credentials/server/signupApiHandler";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import auth from "@/src/pages/api/auth/[...nextauth]";
import signupVerify from "@/src/pages/api/auth/signup-verify";
import { getCookieName } from "@/src/server/utils/cookies";
import { prisma } from "@langfuse/shared/src/db";
import { sendResetPasswordVerificationRequest } from "@langfuse/shared/src/server";

const SETUP_PASSWORD_URL = "http://localhost:3000/auth/setup-password";
const RESET_PASSWORD_URL = "http://localhost:3000/auth/reset-password";

const docsFirstVisitCookie = {
  ph_phc_docsProjectKey_posthog: JSON.stringify({
    distinct_id: "anonymous-id",
    $initial_person_info: {
      r: "https://www.google.com/",
      u: "https://langfuse.com/docs?utm_source=google&utm_medium=cpc&utm_campaign=q4+launch",
    },
  }),
};

const docsFirstVisitSource = {
  utm_source: "google",
  utm_medium: "cpc",
  utm_campaign: "q4 launch",
  signup_referrer: "www.google.com",
  signup_landing_host: "langfuse.com",
  signup_landing_path: "/docs",
};

describe("cloud_signup_complete", () => {
  const overriddenEnvKeys = [
    "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION",
    "AUTH_EMAIL_VERIFICATION_REQUIRED",
    "SMTP_CONNECTION_URL",
    "EMAIL_FROM_ADDRESS",
  ] as const;
  const savedEnv: Record<string, unknown> = {};

  beforeEach(() => {
    for (const key of overriddenEnvKeys) savedEnv[key] = env[key];
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    captureMock.mockReset();
    posthogShutdown.mockReset();
    posthogShutdown.mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.assign(env, savedEnv);
    vi.useRealTimers();
  });

  it("records the OAuth provider and the first visit's source", async () => {
    const email = uniqueEmail();
    oauthProfile.email = email;
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { nextauth: ["callback", "google"] },
      cookies: docsFirstVisitCookie,
    });

    await auth(req, res);

    expect(res.statusCode).toBe(200);
    await expectOneSignupEvent({ email, provider: "google" });
  });

  it("records nothing when an existing account without memberships links a provider", async () => {
    const email = uniqueEmail();
    const existingUser = await prisma.user.create({
      data: { email, name: "Jane Doe" },
    });
    oauthProfile.email = email;
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { nextauth: ["callback", "google"] },
      cookies: docsFirstVisitCookie,
    });

    await auth(req, res);

    expect(res.statusCode).toBe(200);
    await expect(
      prisma.account.findFirst({
        where: { userId: existingUser.id, provider: "google" },
      }),
    ).resolves.not.toBeNull();
    expect(signupEvents()).toHaveLength(0);
  });

  it("records email for the email-code sign-up, then each step of its code", async () => {
    const email = await signUpByEmailCode();
    await expectOneSignupEvent({ email, provider: "email" });
    const { id: userId } = await prisma.user.findUniqueOrThrow({
      where: { email },
    });

    const firstCode = await requestEmailCode(email, SETUP_PASSWORD_URL);
    await requestEmailCode(email, SETUP_PASSWORD_URL);
    // the second request replaced the first code
    await expect(submitEmailCode(email, firstCode, "setup")).rejects.toThrow(
      "This code is wrong or has expired.",
    );
    const lastCode = await requestEmailCode(email, SETUP_PASSWORD_URL);
    await submitEmailCode(email, lastCode, "setup");

    expect(stepEvents()).toEqual([
      {
        distinctId: userId,
        event: "sign_up:code_sent",
        properties: { isResend: false },
      },
      {
        distinctId: userId,
        event: "sign_up:code_sent",
        properties: { isResend: true },
      },
      {
        distinctId: userId,
        event: "sign_up:code_checked",
        properties: { result: "invalid" },
      },
      {
        distinctId: userId,
        event: "sign_up:code_sent",
        properties: { isResend: false },
      },
      {
        distinctId: userId,
        event: "sign_up:code_checked",
        properties: { result: "ok" },
      },
      { distinctId: userId, event: "sign_up:password_set", properties: {} },
    ]);
    await expectOneSignupEvent({ email, provider: "email" });
  });

  it("records an expired sign-up code as expired", async () => {
    const email = await signUpByEmailCode();
    vi.useFakeTimers({ toFake: ["Date"] });
    const code = await requestEmailCode(email, SETUP_PASSWORD_URL);
    vi.setSystemTime(
      Date.now() + (SIGNUP_EMAIL_CODE_MAX_AGE_SECONDS + 60) * 1000,
    );

    await expect(submitEmailCode(email, code, "setup")).rejects.toThrow(
      "This code is wrong or has expired.",
    );

    expect(stepEvents().at(-1)).toMatchObject({
      event: "sign_up:code_checked",
      properties: { result: "expired" },
    });
  });

  it.each([
    {
      what: "PostHog never answers",
      breaks: () => posthogShutdown.mockReturnValue(new Promise(() => {})),
    },
    {
      what: "PostHog throws",
      breaks: () =>
        captureMock.mockImplementation(() => {
          throw new Error("PostHog is down");
        }),
    },
  ])("finishes the setup step at once when $what", async ({ breaks }) => {
    const email = await signUpByEmailCode();
    const code = await requestEmailCode(email, SETUP_PASSWORD_URL);
    breaks();

    expect(
      await outcomeWithin(submitEmailCode(email, code, "setup"), 5000),
    ).toBe("returned");
  });

  it("records no sign-up step when a provisioned account is claimed through the reset step", async () => {
    // as SCIM provisions it: no password, no linked provider account
    const email = uniqueEmail();
    await prisma.user.create({ data: { email, name: "Jane Doe" } });

    const code = await requestEmailCode(email, RESET_PASSWORD_URL);
    await submitEmailCode(email, code, "reset");

    expect(stepEvents()).toEqual([]);
  });

  it("records credentials for the password sign-up", async () => {
    const email = uniqueEmail();
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email, password: "Password1!", name: "Jane Doe" },
      cookies: docsFirstVisitCookie,
    });

    await signupApiHandler(req, res);

    expect(res.statusCode).toBe(200);
    await expectOneSignupEvent({ email, provider: "credentials" });
  });

  async function signUpByEmailCode() {
    (env as any).AUTH_EMAIL_VERIFICATION_REQUIRED = "true";
    (env as any).SMTP_CONNECTION_URL = "smtp://localhost:1025";
    (env as any).EMAIL_FROM_ADDRESS = "noreply@example.com";
    const email = uniqueEmail();
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email, name: "Jane Doe" },
      cookies: docsFirstVisitCookie,
    });

    await signupVerify(req, res);

    expect(res.statusCode).toBe(200);
    return email;
  }

  // a real NextAuth code request; returns the code it sent
  async function requestEmailCode(email: string, callbackUrl: string) {
    (env as any).SMTP_CONNECTION_URL = "smtp://localhost:1025";
    (env as any).EMAIL_FROM_ADDRESS = "noreply@example.com";
    vi.mocked(sendResetPasswordVerificationRequest).mockClear();
    const csrfToken = randomBytes(32).toString("hex");
    const csrfTokenHash = createHash("sha256")
      .update(`${csrfToken}${env.NEXTAUTH_SECRET ?? ""}`)
      .digest("hex");
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      headers: { host: "localhost:3000" },
      query: { nextauth: ["signin", "email"] },
      body: { email, csrfToken, callbackUrl, json: "true" },
    });
    req.cookies = {
      [getCookieName("next-auth.csrf-token")]: `${csrfToken}|${csrfTokenHash}`,
    };

    await auth(req, res);

    expect(res.statusCode).toBe(200);
    expect(sendResetPasswordVerificationRequest).toHaveBeenCalledOnce();
    return vi.mocked(sendResetPasswordVerificationRequest).mock.calls[0][0]
      .token;
  }

  async function submitEmailCode(
    email: string,
    token: string,
    intent: "setup" | "reset",
  ) {
    const ctx = createInnerTRPCContext({ session: null, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    await caller.credentials.resetPassword({
      email,
      token,
      password: "Password1!",
      intent,
    });
  }
});

function uniqueEmail() {
  return `signup-${randomUUID()}@example.com`;
}

async function expectOneSignupEvent({
  email,
  provider,
}: {
  email: string;
  provider: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const events = signupEvents();

  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    distinctId: user.id,
    properties: { provider, ...docsFirstVisitSource },
  });
}

function signupEvents() {
  return captureMock.mock.calls
    .map(([event]) => event)
    .filter(({ event }) => event === "cloud_signup_complete");
}

function stepEvents() {
  return captureMock.mock.calls
    .map(([event]) => event)
    .filter(({ event }) => event.startsWith("sign_up:"));
}

// how a call ends within `ms`: "returned", "threw" or "still waiting"
async function outcomeWithin(call: Promise<unknown>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    call.then(
      () => "returned",
      () => "threw",
    ),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve("still waiting"), ms);
    }),
  ]);
  clearTimeout(timer);
  return outcome;
}
