const {
  addUserToSpanMock,
  createShaHashMock,
  fakeAuthSpan,
  instrumentAsyncMock,
} = vi.hoisted(() => {
  const fakeAuthSpan = {
    end: vi.fn(),
    recordException: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
  };

  return {
    addUserToSpanMock: vi.fn(),
    createShaHashMock: vi.fn(
      (secretKey: string, salt: string) => `hashed:${salt}:${secretKey}`,
    ),
    fakeAuthSpan,
    instrumentAsyncMock: vi.fn(async (_ctx, callback) =>
      callback(fakeAuthSpan),
    ),
  };
});

vi.mock("@/src/env.mjs", () => ({
  env: {
    LANGFUSE_CACHE_API_KEY_ENABLED: "false",
    LANGFUSE_CACHE_API_KEY_TTL_SECONDS: 60,
    SALT: "test-salt",
  },
}));

vi.mock("@/src/features/entitlements/server/getPlan", () => ({
  getOrganizationPlanServerSide: () => "oss",
}));

vi.mock("@/src/utils/exceptions", () => ({
  isPrismaException: () => false,
}));

vi.mock("@langfuse/shared", () => ({
  CloudConfigSchema: {
    parse: vi.fn((value) => value),
  },
  isPlan: vi.fn((plan) => typeof plan === "string"),
}));

vi.mock("@langfuse/shared/src/server", () => ({
  API_KEY_NON_EXISTENT: "api-key-non-existent",
  CachedApiKey: {
    safeParse: vi.fn((value) => ({ data: value, success: true })),
  },
  ClickHouseClientManager: {
    getInstance: vi.fn(() => ({
      closeAllConnections: vi.fn(),
    })),
  },
  OrgEnrichedApiKey: {
    parse: vi.fn((value) => value),
  },
  addUserToSpan: addUserToSpanMock,
  createShaHash: createShaHashMock,
  deleteApiKeyFromDb: vi.fn(),
  invalidateCachedApiKeys: vi.fn(),
  invalidateCachedOrgApiKeys: vi.fn(),
  invalidateCachedProjectApiKeys: vi.fn(),
  instrumentAsync: instrumentAsyncMock,
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  recordIncrement: vi.fn(),
  redis: null,
  verifySecretKey: vi.fn(),
}));

import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";

const createBasicAuthHeader = (publicKey: string, secretKey: string) =>
  `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;

const createProjectApiKey = () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const publicKey = "pk-lf-public";
  const secretKey = "sk-lf-secret";
  const projectId = "project-id";
  const orgId = "org-id";

  return {
    apiKey: {
      id: "api-key-id",
      createdAt: now,
      displaySecretKey: "sk-lf-...cret",
      expiresAt: null,
      fastHashedSecretKey: createShaHashMock(secretKey, "test-salt"),
      hashedSecretKey: "legacy-hash",
      lastUsedAt: null,
      note: null,
      organization: null,
      project: {
        id: projectId,
        organization: {
          id: orgId,
          cloudConfig: null,
          cloudFreeTierUsageThresholdState: null,
          createdAt: now,
          name: "Org",
          updatedAt: now,
        },
      },
      projectId,
      publicKey,
      scope: "PROJECT",
    },
    orgId,
    projectId,
    publicKey,
    secretKey,
  };
};

describe("ApiAuthService span metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds the api key id to the auth span for Basic auth", async () => {
    const { apiKey, orgId, projectId, publicKey, secretKey } =
      createProjectApiKey();
    const prisma = {
      apiKey: {
        findUnique: vi.fn().mockResolvedValue(apiKey),
      },
    };

    const result = await new ApiAuthService(
      prisma as any,
      null,
    ).verifyAuthHeaderAndReturnScope(
      createBasicAuthHeader(publicKey, secretKey),
    );

    expect(result.validKey).toBe(true);
    expect(addUserToSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: apiKey.id,
        orgId,
        projectId,
      }),
      fakeAuthSpan,
    );
  });

  it("adds the api key id to the auth span for Bearer auth", async () => {
    const { apiKey, orgId, projectId, publicKey } = createProjectApiKey();
    const prisma = {
      apiKey: {
        findUnique: vi.fn().mockResolvedValue(apiKey),
      },
    };

    const result = await new ApiAuthService(
      prisma as any,
      null,
    ).verifyAuthHeaderAndReturnScope(`Bearer ${publicKey}`);

    expect(result.validKey).toBe(true);
    expect(addUserToSpanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKeyId: apiKey.id,
        orgId,
        projectId,
      }),
      fakeAuthSpan,
    );
  });
});
