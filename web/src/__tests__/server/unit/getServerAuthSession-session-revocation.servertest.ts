import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import type { Account, Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindUnique, mockQueryRaw, mockInstrumentAsync } = vi.hoisted(
  () => ({
    mockFindUnique: vi.fn(),
    mockQueryRaw: vi.fn(),
    mockInstrumentAsync: vi.fn(
      async (
        _options: unknown,
        callback: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown,
      ) => callback({ setAttribute: vi.fn() }),
    ),
  }),
);

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prisma: {
    user: {
      findUnique: mockFindUnique,
    },
    $queryRaw: mockQueryRaw,
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  instrumentAsync: mockInstrumentAsync,
}));

vi.mock("@/src/features/auth/policy/contextResolver", () => ({
  getPoliciesForUser: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import { getAuthOptions } from "@/src/server/auth";
import { getSsoAuthProviderIdForDomain } from "@/src/ee/features/multi-tenant-sso/utils";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

const loginAt = new Date("2026-09-09T12:00:00.000Z").getTime();

const dbUser = {
  id: "user-1",
  name: "Test User",
  email: "user@example.com",
  image: null,
  emailVerified: new Date("2026-01-01T00:00:00.000Z"),
  password: "hashed-password",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  featureFlags: [],
  v4BetaEnabled: false,
  organizationMemberships: [],
};

const baseSession: Session = createSession({
  user: {
    name: "Test User",
    email: "user@example.com",
    featureFlags: testFeatureFlags({ templateFlag: false }),
  },
  expires: "2026-09-23T12:00:00.000Z",
});

async function getCallbacks() {
  const callbacks = (await getAuthOptions()).callbacks;
  if (!callbacks?.jwt || !callbacks.session) {
    throw new Error("Expected jwt and session callbacks");
  }
  return {
    jwt: callbacks.jwt as (params: {
      token: JWT;
      user?: { id: string };
      account?: Pick<Account, "provider" | "type">;
      profile?: { email: string; email_verified: boolean; hd?: string };
    }) => JWT | Promise<JWT>,
    session: callbacks.session as (params: {
      session: Session;
      token: JWT;
    }) => Session | Promise<Session>,
  };
}

describe("NextAuth JWT session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([
      { loginAt: new Date("2026-09-09T12:00:00.000Z") },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps loginAt from the database clock on initial sign-in and preserves it on refresh", async () => {
    const { jwt } = await getCallbacks();
    const dbNow = new Date("2026-09-09T12:00:00.123Z");
    mockQueryRaw.mockResolvedValueOnce([{ loginAt: dbNow }]);

    const initialToken = await jwt({
      token: { email: "user@example.com" },
      user: { id: "user-1" },
    });
    expect(initialToken.loginAt).toBe(dbNow.getTime());
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);

    const refreshedToken = await jwt({
      token: initialToken,
    });
    expect(refreshedToken.loginAt).toBe(dbNow.getTime());
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it("denies a token without a user id instead of matching on email alone", async () => {
    mockFindUnique.mockResolvedValue(dbUser);

    const { session } = await getCallbacks();
    const result = await session({
      session: baseSession,
      token: { email: "user@example.com", loginAt },
    });

    expect(result.user).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("binds employee OAuth evidence to the signed-in mailbox and its trusted provider", async () => {
    const email = "member@clickhouse.com";
    const profile = { email, email_verified: true, hd: "clickhouse.com" };
    mockFindUnique.mockResolvedValue({ ...dbUser, email, emailVerified: null });
    vi.mocked(getSsoAuthProviderIdForDomain).mockResolvedValue(
      "clickhouse.com.okta",
    );
    const callbacks = await getCallbacks();
    for (const [provider, claims, verified] of [
      ["google", profile, true],
      ["google", { ...profile, hd: "example.com" }, false],
      ["google", { ...profile, email_verified: false }, false],
      ["clickhouse-cloud", { email, email_verified: true }, true],
      ["clickhouse.com.okta", { email, email_verified: true }, true],
      ["other-provider", profile, false],
      [
        "clickhouse.com.okta",
        { ...profile, email: "different@clickhouse.com" },
        false,
      ],
    ] as const) {
      const token = await callbacks.jwt({
        token: { sub: dbUser.id, email },
        user: { id: dbUser.id },
        account: { provider, type: "oauth" },
        profile: claims,
      });
      const refreshed = await callbacks.jwt({ token });
      const result = await callbacks.session({
        session: baseSession,
        token: refreshed,
      });
      expect(result.user?.isVerifiedEmployee).toBe(verified);
    }
  });

  it.each([
    {
      name: "denies a token issued before the revocation timestamp",
      token: { email: "USER@example.com", sub: "user-1", loginAt },
      sessionsExpiredAt: new Date(loginAt + 1),
      isAllowed: false,
    },
    {
      name: "allows a user who has never revoked sessions",
      token: { email: "USER@example.com", sub: "user-1", loginAt },
      sessionsExpiredAt: null,
      isAllowed: true,
    },
    {
      name: "denies a token issued at the revocation timestamp",
      token: { email: "USER@example.com", sub: "user-1", loginAt },
      sessionsExpiredAt: new Date(loginAt),
      isAllowed: false,
    },
    {
      name: "allows a token issued strictly after the revocation timestamp",
      token: { email: "USER@example.com", sub: "user-1", loginAt: loginAt + 1 },
      sessionsExpiredAt: new Date(loginAt),
      isAllowed: true,
    },
    {
      name: "denies a legacy token after sessions have been revoked",
      token: { email: "USER@example.com", sub: "user-1" },
      sessionsExpiredAt: new Date(loginAt),
      isAllowed: false,
    },
  ])("$name", async ({ token, sessionsExpiredAt, isAllowed }) => {
    mockFindUnique.mockImplementation(
      ({
        where,
      }: {
        where: {
          OR: [
            { sessionsExpiredAt: null },
            { sessionsExpiredAt: { lt: Date } },
          ];
        };
      }) => {
        const tokenLoginAt = where.OR[1].sessionsExpiredAt.lt;
        return sessionsExpiredAt === null || sessionsExpiredAt < tokenLoginAt
          ? dbUser
          : null;
      },
    );

    const { session } = await getCallbacks();
    const result = await session({
      session: baseSession,
      token: token as JWT,
    });

    expect(result.user !== null).toBe(isAllowed);
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "user-1",
          email: "user@example.com",
          OR: [
            { sessionsExpiredAt: null },
            {
              sessionsExpiredAt: {
                lt: new Date(token.loginAt ?? 0),
              },
            },
          ],
        },
      }),
    );
  });
});
