// Regression coverage for the LANGFUSE_INIT_* partial-config warnings in
// web/src/initialize.ts. The module is a top-level-await boot file that runs
// once per web container start, so the warnings are the operator's only signal
// during self-hosted deployment that their env-var configuration is incomplete.
// These tests mock prisma + env so the boot body can be re-executed per
// scenario without a live database.

const mockPrisma = {
  organization: { upsert: vi.fn(async () => ({})) },
  project: { upsert: vi.fn(async () => ({})) },
  apiKey: {
    findUnique: vi.fn(async () => null),
    delete: vi.fn(async () => ({})),
  },
  user: { findUnique: vi.fn(async () => null) },
  organizationMembership: { upsert: vi.fn(async () => ({ id: "om-1" })) },
  projectMembership: { upsert: vi.fn(async () => ({})) },
};

vi.mock("@langfuse/shared/src/db", () => ({ prisma: mockPrisma }));
vi.mock("@langfuse/shared/src/server/auth/apiKeys", () => ({
  createAndAddApiKeysToDb: vi.fn(async () => undefined),
}));
vi.mock("@/src/features/auth-credentials/lib/credentialsServerUtils", () => ({
  createUserEmailPassword: vi.fn(async () => "user-id-1"),
}));
vi.mock("@/src/features/entitlements/server/hasEntitlement", () => ({
  hasEntitlementBasedOnPlan: vi.fn(() => false),
}));
vi.mock("@/src/features/entitlements/server/getPlan", () => ({
  getOrganizationPlanServerSide: vi.fn(() => "oss"),
}));

const warnMock = vi.fn();
const errorMock = vi.fn();
const infoMock = vi.fn();

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    initializeClickhouseCompatibility: vi.fn(async () => undefined),
    logger: { warn: warnMock, error: errorMock, info: infoMock },
  };
});

const envBase = {
  LANGFUSE_INIT_ORG_ID: undefined,
  LANGFUSE_INIT_ORG_NAME: undefined,
  LANGFUSE_INIT_ORG_CLOUD_PLAN: undefined,
  LANGFUSE_INIT_PROJECT_ID: undefined,
  LANGFUSE_INIT_PROJECT_NAME: undefined,
  LANGFUSE_INIT_PROJECT_RETENTION: undefined,
  LANGFUSE_INIT_PROJECT_PUBLIC_KEY: undefined,
  LANGFUSE_INIT_PROJECT_SECRET_KEY: undefined,
  LANGFUSE_INIT_USER_EMAIL: undefined,
  LANGFUSE_INIT_USER_NAME: undefined,
  LANGFUSE_INIT_USER_PASSWORD: undefined,
} as const;

function setEnv(overrides: Partial<Record<keyof typeof envBase, string>>) {
  const env = { ...envBase, ...overrides };
  vi.doMock("@/src/env.mjs", () => ({ env }));
  return env;
}

async function runInitialize() {
  vi.resetModules();
  warnMock.mockClear();
  errorMock.mockClear();
  infoMock.mockClear();
  Object.values(mockPrisma).forEach((model) => {
    Object.values(model).forEach((fn) => {
      if (typeof (fn as { mockClear?: () => void }).mockClear === "function") {
        (fn as { mockClear: () => void }).mockClear();
      }
    });
  });
  await import("@/src/initialize");
}

function getWarnMatching(matcher: RegExp) {
  return warnMock.mock.calls.find((call) =>
    typeof call[0] === "string" && matcher.test(call[0]),
  );
}

describe("initialize.ts partial-config warnings", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("emits no warning when no LANGFUSE_INIT_* vars are set", async () => {
    setEnv({});
    await runInitialize();
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("warns about missing LANGFUSE_INIT_ORG_ID when other init vars are set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_NAME: "Test Org",
      LANGFUSE_INIT_ORG_CLOUD_PLAN: "Hobby",
    });
    await runInitialize();
    const call = getWarnMatching(/LANGFUSE_INIT_ORG_ID is not set/);
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("LANGFUSE_INIT_ORG_NAME");
    expect(call?.[0]).toContain("LANGFUSE_INIT_ORG_CLOUD_PLAN");
  });

  it("does not warn about LANGFUSE_INIT_ORG_ID when LANGFUSE_INIT_ORG_ID is set", async () => {
    setEnv({ LANGFUSE_INIT_ORG_ID: "org-1" });
    await runInitialize();
    expect(getWarnMatching(/LANGFUSE_INIT_ORG_ID is not set/)).toBeUndefined();
  });

  it("warns about partial API key config when only public key is set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_PROJECT_ID: "proj-1",
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "pk-lf-test1234567890",
    });
    await runInitialize();
    const call = getWarnMatching(/Partial API key configuration/);
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("LANGFUSE_INIT_PROJECT_SECRET_KEY");
  });

  it("warns about partial API key config when only secret key is set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_PROJECT_ID: "proj-1",
      LANGFUSE_INIT_PROJECT_SECRET_KEY: "sk-lf-test1234567890",
    });
    await runInitialize();
    const call = getWarnMatching(/Partial API key configuration/);
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("LANGFUSE_INIT_PROJECT_PUBLIC_KEY");
  });

  it("does not warn about API key config when both keys are set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_PROJECT_ID: "proj-1",
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "pk-lf-test1234567890",
      LANGFUSE_INIT_PROJECT_SECRET_KEY: "sk-lf-test1234567890",
    });
    await runInitialize();
    expect(getWarnMatching(/Partial API key configuration/)).toBeUndefined();
  });

  it("warns about API keys without LANGFUSE_INIT_PROJECT_ID", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "pk-lf-test1234567890",
      LANGFUSE_INIT_PROJECT_SECRET_KEY: "sk-lf-test1234567890",
    });
    await runInitialize();
    const call = getWarnMatching(
      /API keys will not be created.*Set LANGFUSE_INIT_PROJECT_ID/s,
    );
    expect(call).toBeDefined();
  });

  it("warns about partial user config when only email is set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_USER_EMAIL: "[email protected]",
    });
    await runInitialize();
    const call = getWarnMatching(/Partial user configuration/);
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("LANGFUSE_INIT_USER_PASSWORD");
  });

  it("warns about partial user config when only password is set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_USER_PASSWORD: "Password2#!",
    });
    await runInitialize();
    const call = getWarnMatching(/Partial user configuration/);
    expect(call).toBeDefined();
    expect(call?.[0]).toContain("LANGFUSE_INIT_USER_EMAIL");
  });

  it("does not warn about user config when both email and password are set", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_USER_EMAIL: "[email protected]",
      LANGFUSE_INIT_USER_PASSWORD: "Password2#!",
    });
    await runInitialize();
    expect(getWarnMatching(/Partial user configuration/)).toBeUndefined();
  });

  it("happy path: no warnings, full org+project+key+user chain", async () => {
    setEnv({
      LANGFUSE_INIT_ORG_ID: "org-1",
      LANGFUSE_INIT_PROJECT_ID: "proj-1",
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: "pk-lf-test1234567890",
      LANGFUSE_INIT_PROJECT_SECRET_KEY: "sk-lf-test1234567890",
      LANGFUSE_INIT_USER_EMAIL: "[email protected]",
      LANGFUSE_INIT_USER_PASSWORD: "Password2#!",
    });
    await runInitialize();
    expect(warnMock).not.toHaveBeenCalled();
  });
});
