import { randomUUID } from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import type * as NextAuthModule from "next-auth";
import type { NextAuthOptions } from "next-auth";
import { createMocks } from "node-mocks-http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, oauthProfile } = vi.hoisted(() => ({
  captureMock: vi.fn(),
  oauthProfile: { email: "" },
}));

vi.mock("@/src/features/posthog-analytics/ServerPosthog", () => ({
  ServerPosthog: class {
    capture = captureMock;
    async shutdown() {}
  },
}));

// Stands in for NextAuth's OAuth callback once the provider handshake is
// done: it creates the new user, then links the provider account to it.
vi.mock("next-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof NextAuthModule>();
  return {
    ...actual,
    default: async (
      req: NextApiRequest,
      res: NextApiResponse,
      options: NextAuthOptions,
    ) => {
      const adapter = options.adapter;
      if (!adapter?.createUser || !adapter.linkAccount) {
        throw new Error("NextAuth adapter without createUser/linkAccount");
      }
      const [, provider] = req.query.nextauth as string[];
      const user = await adapter.createUser({
        email: oauthProfile.email,
        emailVerified: null,
        name: "Jane Doe",
      });
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
import { signupApiHandler } from "@/src/features/auth-credentials/server/signupApiHandler";
import auth from "@/src/pages/api/auth/[...nextauth]";
import signupVerify from "@/src/pages/api/auth/signup-verify";
import { prisma } from "@langfuse/shared/src/db";

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
  });

  afterEach(() => {
    Object.assign(env, savedEnv);
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

  it("records email for the email-code sign-up", async () => {
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
    await expectOneSignupEvent({ email, provider: "email" });
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
  const signupEvents = captureMock.mock.calls
    .map(([event]) => event)
    .filter(({ event }) => event === "cloud_signup_complete");

  expect(signupEvents).toHaveLength(1);
  expect(signupEvents[0]).toMatchObject({
    distinctId: user.id,
    properties: { provider, ...docsFirstVisitSource },
  });
}
