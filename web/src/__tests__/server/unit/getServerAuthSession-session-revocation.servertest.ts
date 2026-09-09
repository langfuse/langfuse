import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockFindFirst, mockInstrumentAsync } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockInstrumentAsync: vi.fn(
    async (
      _options: unknown,
      callback: (span: { setAttribute: ReturnType<typeof vi.fn> }) => unknown,
    ) => callback({ setAttribute: vi.fn() }),
  ),
}));

vi.mock("@langfuse/shared/src/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prisma: {
    user: {
      findFirst: mockFindFirst,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  instrumentAsync: mockInstrumentAsync,
}));

vi.mock("@/src/ee/features/multi-tenant-sso/utils", () => ({
  findMultiTenantSsoConfig: vi.fn(),
  getSsoAuthProviderIdForDomain: vi.fn(),
  loadSsoProviders: vi.fn().mockResolvedValue([]),
}));

import { getAuthOptions } from "@/src/server/auth";

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
  admin: false,
  v4BetaEnabled: false,
  organizationMemberships: [],
};

const baseSession: Session = {
  expires: "2026-09-23T12:00:00.000Z",
  user: {
    id: "user-1",
    name: "Test User",
    email: "user@example.com",
    canCreateOrganizations: true,
    organizations: [],
    featureFlags: {
      searchBar: false,
      templateFlag: false,
      excludeClickhouseRead: false,
      observationEvals: false,
      v4BetaToggleVisible: false,
      experimentsV4Enabled: false,
    },
    admin: false,
  },
  environment: {
    enableExperimentalFeatures: false,
    selfHostedInstancePlan: null,
  },
};

async function getCallbacks() {
  const callbacks = (await getAuthOptions()).callbacks;
  if (!callbacks?.jwt || !callbacks.session) {
    throw new Error("Expected jwt and session callbacks");
  }
  return callbacks;
}

describe("NextAuth JWT session revocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stamps loginAt on initial sign-in and preserves it on refresh", async () => {
    const { jwt } = await getCallbacks();
    const now = new Date("2026-09-09T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const initialToken = await jwt({
      token: { email: "user@example.com" },
      user: { id: "user-1" },
      account: null,
      profile: undefined,
      isNewUser: false,
      trigger: "signIn",
    });
    expect(initialToken.loginAt).toBe(now.getTime());

    const refreshedToken = await jwt({
      token: initialToken,
      trigger: "update",
      session: baseSession,
    });
    expect(refreshedToken.loginAt).toBe(now.getTime());
  });

  it.each([
    {
      name: "denies a token issued before the revocation timestamp",
      token: { email: "USER@example.com", loginAt },
      sessionsValidAfter: new Date(loginAt + 1),
      isAllowed: false,
    },
    {
      name: "allows a user who has never revoked sessions",
      token: { email: "USER@example.com", loginAt },
      sessionsValidAfter: null,
      isAllowed: true,
    },
    {
      name: "allows a token issued at the revocation timestamp",
      token: { email: "USER@example.com", loginAt },
      sessionsValidAfter: new Date(loginAt),
      isAllowed: true,
    },
    {
      name: "denies a legacy token after sessions have been revoked",
      token: { email: "USER@example.com" },
      sessionsValidAfter: new Date(loginAt),
      isAllowed: false,
    },
  ])("$name", async ({ token, sessionsValidAfter, isAllowed }) => {
    mockFindFirst.mockImplementation(
      ({
        where,
      }: {
        where: {
          OR: [
            { sessionsValidAfter: null },
            { sessionsValidAfter: { lte: Date } },
          ];
        };
      }) => {
        const tokenLoginAt = where.OR[1].sessionsValidAfter.lte;
        return sessionsValidAfter === null || sessionsValidAfter <= tokenLoginAt
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
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: "user@example.com",
          OR: [
            { sessionsValidAfter: null },
            {
              sessionsValidAfter: {
                lte: new Date(token.loginAt ?? 0),
              },
            },
          ],
        },
      }),
    );
  });
});
