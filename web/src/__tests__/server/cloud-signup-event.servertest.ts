import { createHash, randomBytes, randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type * as NextAuthModule from "next-auth";
import type { NextAuthOptions } from "next-auth";
import type * as SharedServerModule from "@langfuse/shared/src/server";
import type * as MultiTenantSsoUtils from "@/src/ee/features/multi-tenant-sso/utils";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, posthogShutdown, oauthProfile, enterpriseSsoProviderIds } =
  vi.hoisted(() => ({
    captureMock: vi.fn(),
    posthogShutdown: vi.fn(),
    oauthProfile: { email: "" },
    enterpriseSsoProviderIds: new Set<string>(),
  }));

// cloud_signup_complete's own client and the shared one both record here
vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  ServerPosthog: class {
    capture = captureMock;
    shutdown = posthogShutdown;
  },
  getServerPosthog: () => ({ capture: captureMock }),
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof MultiTenantSsoUtils>();
  return {
    ...actual,
    findMultiTenantSsoConfig: async ({ providerId }: { providerId: string }) =>
      enterpriseSsoProviderIds.has(providerId)
        ? { isMultiTenantSsoProvider: true, domain: "example.com" }
        : { isMultiTenantSsoProvider: false, domain: null },
  };
});

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
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  logger,
  sendResetPasswordVerificationRequest,
} from "@langfuse/shared/src/server";

const SIGNUP_WEBHOOK_URL = "https://hooks.example.com/signup";
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
    "LANGFUSE_NEW_USER_SIGNUP_WEBHOOK",
  ] as const;
  const savedEnv: Record<string, unknown> = {};
  const webhookMock = vi.fn();

  beforeEach(() => {
    for (const key of overriddenEnvKeys) savedEnv[key] = env[key];
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    (env as any).LANGFUSE_NEW_USER_SIGNUP_WEBHOOK = SIGNUP_WEBHOOK_URL;
    captureMock.mockReset();
    posthogShutdown.mockReset();
    posthogShutdown.mockResolvedValue(undefined);
    enterpriseSsoProviderIds.clear();
    webhookMock.mockReset();
    webhookMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", webhookMock);
  });

  afterEach(() => {
    Object.assign(env, savedEnv);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("records the OAuth provider and the first visit's source", async () => {
    const email = uniqueEmail();

    await linkLogin(email, "google");

    await expectOneSignupEvent({ email, provider: "google" });
    await expectOneWebhook({ email });
    await webhookSettled();
    expect(stepEvents().map(({ event }) => event)).toEqual([
      "sign_up:webhook_sent",
    ]);
  });

  it.each([
    {
      linkedProvider: "clickhouse-cloud",
      recordedProvider: "clickhouse-cloud",
    },
    // an enterprise SSO id the lookup missed, as after a failed config refresh
    { linkedProvider: "customer.example.okta", recordedProvider: "sso" },
  ])(
    "records a pending email sign-up finished through a linked $linkedProvider login as a step, not a second sign-up",
    async ({ linkedProvider, recordedProvider }) => {
      const email = await signUpByEmailCode();
      const { id: userId } = await prisma.user.findUniqueOrThrow({
        where: { email },
      });

      await linkLogin(email, linkedProvider);

      await expectOneSignupEvent({ email, provider: "email" });
      await webhookSettled();
      expect(stepEvents()).toEqual([
        {
          distinctId: userId,
          event: "sign_up:completed_via_link",
          properties: { provider: recordedProvider },
        },
        {
          distinctId: userId,
          event: "sign_up:webhook_sent",
          properties: { result: "ok" },
        },
      ]);
      await expectOneWebhook({ email });
    },
  );

  it("records nothing when an account with a password links a provider", async () => {
    const email = uniqueEmail();
    await prisma.user.create({
      data: { email, name: "Jane Doe", password: "password-hash" },
    });

    await linkLogin(email, "google");

    expectNothingRecorded();
  });

  it("records nothing when an account that already has a login links another", async () => {
    const email = uniqueEmail();
    const user = await prisma.user.create({
      data: { email, name: "Jane Doe" },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        type: "oauth",
        provider: "github",
        providerAccountId: `github-${randomUUID()}`,
      },
    });

    await linkLogin(email, "google");

    expectNothingRecorded();
  });

  it("records nothing on a SCIM user's first enterprise SSO sign-in", async () => {
    enterpriseSsoProviderIds.add("example.com.okta");
    // as SCIM provisions it: a member of the org, no password, no login
    const email = uniqueEmail();
    const user = await prisma.user.create({
      data: { email, name: "Jane Doe" },
    });
    const organization = await prisma.organization.create({
      data: { name: `SCIM Org ${randomUUID()}` },
    });
    await prisma.organizationMembership.create({
      data: { orgId: organization.id, userId: user.id, role: Role.MEMBER },
    });

    await linkLogin(email, "example.com.okta");

    expectNothingRecorded();
  });

  it("records a new user's first enterprise SSO sign-in once, as sso", async () => {
    enterpriseSsoProviderIds.add("example.com.okta");
    const email = uniqueEmail();

    await linkLogin(email, "example.com.okta");

    await expectOneSignupEvent({ email, provider: "sso" });
    await expectOneWebhook({ email });
    await webhookSettled();
    expect(stepEvents().map(({ event }) => event)).toEqual([
      "sign_up:webhook_sent",
    ]);
  });

  it("records email for the email-code sign-up, then each step of its code", async () => {
    const email = await signUpByEmailCode();
    await expectOneSignupEvent({ email, provider: "email" });
    expect(webhookMock).not.toHaveBeenCalled();
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
    await webhookSettled();

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
      {
        distinctId: userId,
        event: "sign_up:webhook_sent",
        properties: { result: "ok" },
      },
    ]);
    await expectOneSignupEvent({ email, provider: "email" });
    await expectOneWebhook({ email });
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
    expect(webhookMock).not.toHaveBeenCalled();
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
    {
      what: "the webhook never answers",
      breaks: () => webhookMock.mockReturnValue(new Promise(() => {})),
    },
    {
      // the webhook's own error log throws, so the call itself rejects
      what: "the webhook call rejects",
      breaks: () => {
        webhookMock.mockRejectedValue(new TypeError("fetch failed"));
        vi.spyOn(logger, "warn").mockImplementationOnce(() => {
          throw new Error("logger broke");
        });
      },
    },
  ])("finishes the setup step at once when $what", async ({ breaks }) => {
    const email = await signUpByEmailCode();
    const code = await requestEmailCode(email, SETUP_PASSWORD_URL);
    breaks();

    expect(
      await outcomeWithin(submitEmailCode(email, code, "setup"), 5000),
    ).toBe("returned");
  });

  it.each([
    {
      client: "the reset page",
      callbackUrl: RESET_PASSWORD_URL,
      intent: "reset",
    },
    {
      client: "a client from before intent",
      callbackUrl: SETUP_PASSWORD_URL,
      intent: undefined,
    },
  ] as const)(
    "sends one webhook for an email sign-up finished on $client",
    async ({ callbackUrl, intent }) => {
      const email = await signUpByEmailCode();
      const code = await requestEmailCode(email, callbackUrl);
      await submitEmailCode(email, code, intent);

      await expectOneWebhook({ email });
    },
  );

  it("sends the webhook but records no sign-up step when a provisioned account is claimed through the reset step", async () => {
    // as SCIM provisions it: no password, no linked provider account
    const email = uniqueEmail();
    await prisma.user.create({ data: { email, name: "Jane Doe" } });

    const code = await requestEmailCode(email, RESET_PASSWORD_URL);
    await submitEmailCode(email, code, "reset");

    await webhookSettled();
    expect(stepEvents().map(({ event }) => event)).toEqual([
      "sign_up:webhook_sent",
    ]);
    await expectOneWebhook({ email });
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
    await expectOneWebhook({ email });
  });

  it("keeps a sign-up whose webhook stalls, and records the timeout", async () => {
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockImplementation(() => realTimeout(10));
    webhookMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        }),
    );
    const warn = vi.spyOn(logger, "warn");
    const email = uniqueEmail();

    const statusCode = await signUpWithPassword(email);

    expect(statusCode).toBe(200);
    await webhookSettled();
    expect(timeout).toHaveBeenCalledWith(5000);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(warn).toHaveBeenCalledWith("Sign-up webhook failed", {
      userId: user.id,
      error: expect.stringMatching(/timeout/i),
    });
    expect(stepEvents()).toEqual([
      {
        distinctId: user.id,
        event: "sign_up:webhook_sent",
        properties: { result: "timeout" },
      },
    ]);
  });

  it.each([
    {
      failure: "throws",
      fails: () => webhookMock.mockRejectedValue(new TypeError("fetch failed")),
      logged: { error: "fetch failed" },
    },
    {
      failure: "answers 500",
      fails: () =>
        webhookMock.mockResolvedValue(new Response(null, { status: 500 })),
      logged: { status: 500 },
    },
  ])(
    "keeps a sign-up whose webhook $failure, and records the error",
    async ({ fails, logged }) => {
      fails();
      const warn = vi.spyOn(logger, "warn");
      const email = uniqueEmail();

      const statusCode = await signUpWithPassword(email);

      expect(statusCode).toBe(200);
      await webhookSettled();
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(warn).toHaveBeenCalledWith("Sign-up webhook failed", {
        userId: user.id,
        ...logged,
      });
      expect(JSON.stringify(warn.mock.calls)).not.toContain(email);
      expect(stepEvents()).toEqual([
        {
          distinctId: user.id,
          event: "sign_up:webhook_sent",
          properties: { result: "error" },
        },
      ]);
    },
  );

  async function signUpWithPassword(email: string) {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "POST",
      body: { email, password: "Password1!", name: "Jane Doe" },
      cookies: docsFirstVisitCookie,
    });

    await signupApiHandler(req, res);

    return res.statusCode;
  }

  function expectNothingRecorded() {
    expect(signupEvents()).toHaveLength(0);
    expect(stepEvents()).toHaveLength(0);
    expect(webhookMock).not.toHaveBeenCalled();
  }

  async function linkLogin(email: string, provider: string) {
    oauthProfile.email = email;
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: "GET",
      query: { nextauth: ["callback", provider] },
      cookies: docsFirstVisitCookie,
    });

    await auth(req, res);

    expect(res.statusCode).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await expect(
      prisma.account.findFirst({ where: { userId: user.id, provider } }),
    ).resolves.not.toBeNull();
  }

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
    intent: "setup" | "reset" | undefined,
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

async function expectOneWebhook({ email }: { email: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const webhookCalls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === SIGNUP_WEBHOOK_URL);

  expect(webhookCalls).toHaveLength(1);
  expect(JSON.parse(webhookCalls[0][1]?.body as string)).toEqual({
    name: "Jane Doe",
    email,
    cloudRegion: "EU",
    userId: user.id,
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

// waits for the background webhook to record its result
async function webhookSettled() {
  await vi.waitFor(() =>
    expect(stepEvents().map(({ event }) => event)).toContain(
      "sign_up:webhook_sent",
    ),
  );
}
