import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---- Hoisted mocks ----

const { envMock, prismaMock, loggerMock, fetchMock } = vi.hoisted(() => {
  return {
    // Mutable env object handed to the env-module mock below. It starts with
    // the Mulesoft test defaults; the mock factory layers the real
    // (dotenv-loaded) env underneath so the full router graph imported by the
    // call-site tests reads its usual values. Tests toggle individual keys;
    // beforeEach restores the defaults.
    envMock: {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING",
      MULESOFT_SFDC_USER_URL: "https://mulesoft.test/manage-user",
      MULESOFT_SFDC_ORG_URL: "https://mulesoft.test/manage-org",
      MULESOFT_SFDC_BASIC_AUTH_USER: "mule-user",
      MULESOFT_SFDC_BASIC_AUTH_PASSWORD: "mule-pass",
      MULESOFT_SFDC_DEFAULT_COMPANY_NAME: "Acme Corp",
    } as Record<string, unknown> & {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: string | undefined;
      MULESOFT_SFDC_USER_URL: string | undefined;
      MULESOFT_SFDC_ORG_URL: string | undefined;
      MULESOFT_SFDC_BASIC_AUTH_USER: string | undefined;
      MULESOFT_SFDC_BASIC_AUTH_PASSWORD: string | undefined;
      MULESOFT_SFDC_DEFAULT_COMPANY_NAME: string | undefined;
    },
    prismaMock: {
      user: {
        findUnique: vi.fn(async (_args?: unknown): Promise<unknown> => null),
        update: vi.fn(async () => ({})),
      },
      organization: {
        findUnique: vi.fn(
          async (): Promise<{ sfdcOrgId: string | null } | null> => null,
        ),
        update: vi.fn(async () => ({})),
        create: vi.fn(
          async (): Promise<unknown> => ({
            id: "org-new",
            name: "New Org",
            createdAt: new Date("2026-06-01T08:30:00.900Z"),
          }),
        ),
      },
      organizationMembership: {
        findFirst: vi.fn(async (): Promise<unknown> => null),
        findMany: vi.fn(async (): Promise<unknown[]> => []),
        count: vi.fn(async () => 1),
        create: vi.fn(async (): Promise<unknown> => ({})),
        update: vi.fn(async (): Promise<unknown> => ({})),
        upsert: vi.fn(async (): Promise<unknown> => ({})),
      },
      membershipInvitation: {
        findFirst: vi.fn(async (): Promise<unknown> => null),
        findMany: vi.fn(async (): Promise<unknown[]> => []),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      project: {
        findUnique: vi.fn(async (): Promise<unknown> => null),
        create: vi.fn(async (): Promise<unknown> => ({ id: "proj-new" })),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      // Starter-org provisioning serializes on SELECT ... FOR UPDATE.
      $queryRaw: vi.fn(async (): Promise<unknown> => []),
      // tRPC organizations.create wraps its writes in a callback transaction;
      // invitation processing uses the array form — support both.
      $transaction: vi.fn(
        async (
          arg: ((tx: unknown) => Promise<unknown>) | Promise<unknown>[],
        ): Promise<unknown> =>
          Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock),
      ),
    },
    loggerMock: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
    },
    fetchMock: vi.fn(),
  };
});

// Partial mock — real env underneath, mutable Mulesoft overrides on top.
// envMock keeps its object identity so per-test mutations stay visible.
vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = (await importOriginal()) as { env: Record<string, unknown> };
  const testDefaults = { ...envMock };
  Object.assign(envMock, actual.env, testDefaults);
  return { env: envMock };
});
// Partial mock — keep Role/Prisma/type exports for the router graph; only
// the prisma client is replaced.
vi.mock("@langfuse/shared/src/db", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, prisma: prismaMock };
});
// Partial mock — keep real exports for teardown.ts which imports `redis` and
// `ClickHouseClientManager` from this module.
vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logger: loggerMock,
  };
});

// Replace global fetch with our mock so the service hits it.
vi.stubGlobal("fetch", fetchMock);

// ---- Imports under test (after mocks) ----

import {
  SfdcService,
  getSfdcService,
  resetSfdcServiceCacheForTests,
  toSfdcPlan,
  syncOrgPlanChangeToSfdc,
} from "@/src/ee/features/sfdc-sync/server";
import { createProjectMembershipsOnSignup } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { handleUpdateMembership } from "@/src/ee/features/admin-api/server/memberships";
import { CloudConfigSchema, Role } from "@langfuse/shared";
import { type PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { type NextApiRequest, type NextApiResponse } from "next";

// ---- Helpers ----

function okJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function emptyOkResponse(): Response {
  return new Response("", { status: 200 });
}

function nonOkResponse(status: number, body = "boom"): Response {
  return new Response(body, { status });
}

function expectedBasicAuthHeader(): string {
  return "Basic " + Buffer.from("mule-user:mule-pass").toString("base64");
}

// Fixed dates with millisecond components — payload asserts verify the wire
// formats: user dates are seconds-precision ISO UTC (millis stripped), org
// dates are date-only (the SFDC org fields are Date-typed and reject
// datetimes).
const SIGNUP_AT = new Date("2026-07-08T09:41:23.123Z");
const SIGNUP_AT_ISO_SECONDS = "2026-07-08T09:41:23Z";
const ORG_CREATED_AT = new Date("2026-06-01T08:30:00.900Z");
const ORG_CREATED_AT_ISO_DATE = "2026-06-01";
const CONVERTED_AT = new Date("2026-06-15T12:00:00.450Z");
const CONVERTED_AT_ISO_DATE = "2026-06-15";

/** Minimal valid upsertUser input; tests override what they assert on. */
function upsertUserInput(overrides: Record<string, unknown> = {}) {
  return {
    userId: "user-123",
    email: "u@example.com",
    name: "Test User",
    createdAt: SIGNUP_AT,
    leadSource: "Langfuse Cloud Signup" as const,
    ...overrides,
  };
}

/** Minimal valid upsertOrg input; tests override what they assert on. */
function upsertOrgInput(overrides: Record<string, unknown> = {}) {
  return {
    orgId: "org-1",
    orgName: "Org One",
    createdAt: ORG_CREATED_AT,
    plan: "Hobby" as const,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSfdcServiceCacheForTests();
  // Restore default happy-path env
  envMock.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
  envMock.MULESOFT_SFDC_USER_URL = "https://mulesoft.test/manage-user";
  envMock.MULESOFT_SFDC_ORG_URL = "https://mulesoft.test/manage-org";
  envMock.MULESOFT_SFDC_BASIC_AUTH_USER = "mule-user";
  envMock.MULESOFT_SFDC_BASIC_AUTH_PASSWORD = "mule-pass";
  envMock.MULESOFT_SFDC_DEFAULT_COMPANY_NAME = "Acme Corp";
});

describe("SfdcService — factory gating", () => {
  // Each required env var is individually a kill switch.
  it.each([
    "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION",
    "MULESOFT_SFDC_USER_URL",
    "MULESOFT_SFDC_ORG_URL",
    "MULESOFT_SFDC_BASIC_AUTH_USER",
    "MULESOFT_SFDC_BASIC_AUTH_PASSWORD",
  ] as const)("returns null when %s is missing", (key) => {
    envMock[key] = undefined;
    expect(SfdcService.tryCreate()).toBeNull();
  });

  it("caches the instance across getSfdcService() calls", () => {
    const a = getSfdcService();
    const b = getSfdcService();
    expect(a).toBeInstanceOf(SfdcService);
    expect(a).toBe(b);
  });
});

describe("SfdcService.upsertUser", () => {
  it("sends isLangfuse + companyName sentinel + signup date + lead source + basic-auth", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    const sfdc = SfdcService.tryCreate();
    expect(sfdc).not.toBeNull();
    await sfdc!.upsertUser(upsertUserInput());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mulesoft.test/manage-user");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe(expectedBasicAuthHeader());
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      isLangfuse: true,
      userId: "user-123",
      email: "u@example.com",
      fullName: "Test User",
      companyName: envMock.MULESOFT_SFDC_DEFAULT_COMPANY_NAME,
      // Mulesoft date contract: ISO UTC, seconds precision, no millis.
      createdAt: SIGNUP_AT_ISO_SECONDS,
      leadSource: "Langfuse Cloud Signup",
    });
  });

  it("passes the invite lead source through verbatim", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertUser(
      upsertUserInput({ leadSource: "Langfuse Cloud Invite" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.leadSource).toBe("Langfuse Cloud Invite");
  });

  it("uses caller-provided companyName when given", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertUser(
      upsertUserInput({ companyName: "Acme Inc" }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.companyName).toBe("Acme Inc");
  });

  it.each([null, undefined, ""])(
    "falls back to email as fullName when name is %s",
    async (name) => {
      fetchMock.mockResolvedValueOnce(emptyOkResponse());
      await SfdcService.tryCreate()!.upsertUser(upsertUserInput({ name }));
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.fullName).toBe("u@example.com");
    },
  );

  it("skips without calling fetch when email is missing", async () => {
    await SfdcService.tryCreate()!.upsertUser(upsertUserInput({ email: null }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it("treats the plain-text 'Success' ack as success — no warn, no persistence", async () => {
    // /manage-user never returns JSON or an id; CH Cloud discards this
    // response too.
    fetchMock.mockResolvedValueOnce(new Response("Success", { status: 200 }));
    await SfdcService.tryCreate()!.upsertUser(upsertUserInput());
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not throw on non-2xx; logs an error instead", async () => {
    fetchMock.mockResolvedValueOnce(nonOkResponse(500));
    await SfdcService.tryCreate()!.upsertUser(upsertUserInput());
    expect(loggerMock.error).toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not throw on fetch network error; logs an error instead", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      SfdcService.tryCreate()!.upsertUser(upsertUserInput()),
    ).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("never rejects on invalid email — logs warn and skips fetch", async () => {
    await expect(
      SfdcService.tryCreate()!.upsertUser(
        upsertUserInput({ email: "not-an-email" }),
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe("SfdcService.upsertOrg", () => {
  it("sends the org-only updateOrg payload — created date + tier, no user fields", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertOrg(upsertOrgInput({ plan: "Pro" }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mulesoft.test/manage-org");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      isLangfuse: true,
      type: "updateOrg",
      orgId: "org-1",
      orgName: "Org One",
      createdAt: ORG_CREATED_AT_ISO_DATE,
      plan: "Pro",
      // Cloud region the org lives in, sourced from NEXT_PUBLIC_LANGFUSE_CLOUD_REGION.
      langfuseDataRegion: "STAGING",
      // Mulesoft's updateOrg flow 500s when the CH service counts are
      // missing (null > 0 comparison in DataWeave) — must always be sent.
      numServicesAws: 0,
      numServicesGcp: 0,
      numServicesAzure: 0,
    });
    // Mulesoft ignores user fields on updateOrg — they must not be sent.
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("role");
    // Never converted — the field is omitted, not sent as null.
    expect(body).not.toHaveProperty("convertedToPaidAt");
  });

  it("sends convertedToPaidAt (date-only) when the org has converted", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertOrg(
      upsertOrgInput({ plan: "Team", convertedToPaidAt: CONVERTED_AT }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plan).toBe("Team");
    expect(body.convertedToPaidAt).toBe(CONVERTED_AT_ISO_DATE);
  });

  it("sends langfuseDataRegion from NEXT_PUBLIC_LANGFUSE_CLOUD_REGION", async () => {
    envMock.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "EU";
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertOrg(upsertOrgInput());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.langfuseDataRegion).toBe("EU");
  });

  it("persists sfdcOrgId on 2xx with id in response", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-o-9" }));
    await SfdcService.tryCreate()!.upsertOrg(
      upsertOrgInput({ orgId: "org-9" }),
    );
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-9" },
      data: { sfdcOrgId: "sfdc-o-9" },
    });
  });

  it("does not persist when the response omits sfdcOrgId", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({}));
    await SfdcService.tryCreate()!.upsertOrg(
      upsertOrgInput({ orgId: "org-9" }),
    );
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("logs error on mismatched existing sfdcOrgId but does NOT overwrite", async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      sfdcOrgId: "sfdc-old",
    });
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-new" }));
    await SfdcService.tryCreate()!.upsertOrg(
      upsertOrgInput({ orgId: "org-9" }),
    );
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.stringContaining("sfdcOrgId changed"),
      expect.objectContaining({
        orgId: "org-9",
        existingSfdcOrgId: "sfdc-old",
        returnedSfdcOrgId: "sfdc-new",
      }),
    );
    // existing value preserved — no overwrite
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("never rejects even when persistence throws after a 2xx", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-x" }));
    prismaMock.organization.findUnique.mockRejectedValueOnce(
      new Error("db down"),
    );
    await expect(
      SfdcService.tryCreate()!.upsertOrg(upsertOrgInput({ orgId: "org-9" })),
    ).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });
});

describe("toSfdcPlan — resolved entitlement plan to SFDC tier picklist", () => {
  it.each([
    ["cloud:hobby", "Hobby"],
    ["cloud:core", "Core"],
    ["cloud:pro", "Pro"],
    ["cloud:team", "Team"],
    ["cloud:enterprise", "Enterprise"],
  ] as const)("maps %s to %s", (plan, sfdcPlan) => {
    expect(toSfdcPlan(plan)).toBe(sfdcPlan);
  });

  it.each(["oss", "self-hosted:pro", "self-hosted:enterprise"] as const)(
    "returns null for non-cloud plan %s",
    (plan) => {
      expect(toSfdcPlan(plan)).toBeNull();
    },
  );
});

describe("SfdcService.setUserRole — Langfuse roles map onto the SFDC picklist", () => {
  // SFDC only accepts ADMIN and DEVELOPER as org-member roles.
  it.each([
    ["OWNER", "ADMIN"],
    ["ADMIN", "ADMIN"],
    ["MEMBER", "DEVELOPER"],
    ["VIEWER", "DEVELOPER"],
  ] as const)("maps %s to %s", async (role, sfdcRole) => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.setUserRole({
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
      role,
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      isLangfuse: true,
      type: "setUserRole",
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
      role: sfdcRole,
    });
  });

  it("syncs NONE roles as removeUser — a project-only member holds no org-member bridge", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.setUserRole({
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
      role: "NONE",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      isLangfuse: true,
      type: "removeUser",
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
    });
  });

  it("skips without calling fetch when email is missing", async () => {
    await SfdcService.tryCreate()!.setUserRole({
      orgId: "org-1",
      userId: "user-1",
      email: undefined,
      role: "ADMIN",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it("ignores the response body — only upsertOrg persists sfdcOrgId", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-o-9" }));
    await SfdcService.tryCreate()!.setUserRole({
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
      role: "ADMIN",
    });
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});

describe("SfdcService.removeUser", () => {
  it("sends type:removeUser without role + with isLangfuse", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.removeUser({
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({
      isLangfuse: true,
      type: "removeUser",
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
    });
  });
});

describe("syncOrgPlanChangeToSfdc — plan-change gate for billing updates", () => {
  // Stripe product ids from the catalogue (identical in sandbox and live).
  const PRO_PRODUCT = "prod_QhK7UMhrkVeF6R";
  const TEAM_PRODUCT = "prod_QhK9qKGH25BTcS";

  // getOrganizationPlanServerSide reads process.env directly (not env.mjs),
  // so the region must be stubbed on the real process env.
  const originalRegion = process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "STAGING";
  });
  afterEach(() => {
    if (originalRegion === undefined) {
      delete process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;
    } else {
      process.env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalRegion;
    }
  });

  const orgBefore = (cloudConfig: unknown) => ({
    id: "org-1",
    name: "Org One",
    createdAt: ORG_CREATED_AT,
    cloudConfig:
      cloudConfig === null ? null : CloudConfigSchema.parse(cloudConfig),
  });

  const stripeConfig = (productId: string) => ({
    stripe: {
      customerId: "cus_1",
      activeSubscriptionId: "sub_1",
      activeProductId: productId,
      activeUsageProductId: "prod_usage",
      subscriptionStatus: "active",
    },
  });

  it("pushes tier + conversion date on the first upgrade from Hobby", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore(null),
      updatedCloudConfig: stripeConfig(PRO_PRODUCT),
      billingCycleAnchor: CONVERTED_AT,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      type: "updateOrg",
      orgId: "org-1",
      orgName: "Org One",
      createdAt: ORG_CREATED_AT_ISO_DATE,
      plan: "Pro",
      convertedToPaidAt: CONVERTED_AT_ISO_DATE,
    });
    expect(body).not.toHaveProperty("userId");
  });

  it("pushes tier switches between paid plans, keeping the conversion date", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore(stripeConfig(PRO_PRODUCT)),
      updatedCloudConfig: stripeConfig(TEAM_PRODUCT),
      billingCycleAnchor: CONVERTED_AT,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plan).toBe("Team");
    expect(body.convertedToPaidAt).toBe(CONVERTED_AT_ISO_DATE);
  });

  it("pushes a Hobby downgrade WITHOUT convertedToPaidAt so SFDC keeps the old value", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore(stripeConfig(PRO_PRODUCT)),
      // subscription.deleted keeps only the customer id
      updatedCloudConfig: { stripe: { customerId: "cus_1" } },
      billingCycleAnchor: null,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.plan).toBe("Hobby");
    expect(body).not.toHaveProperty("convertedToPaidAt");
  });

  it("does NOT push when the resolved plan is unchanged (monthly invoice cycling)", async () => {
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore(stripeConfig(PRO_PRODUCT)),
      updatedCloudConfig: stripeConfig(PRO_PRODUCT),
      billingCycleAnchor: CONVERTED_AT,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT push for orgs on a manual plan override — the override wins on both sides", async () => {
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore({
        plan: "Enterprise",
        ...stripeConfig(PRO_PRODUCT),
      }),
      updatedCloudConfig: {
        plan: "Enterprise",
        stripe: { customerId: "cus_1" },
      },
      billingCycleAnchor: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips and logs when the updated cloudConfig does not parse", async () => {
    await syncOrgPlanChangeToSfdc({
      orgBeforeUpdate: orgBefore(null),
      updatedCloudConfig: { plan: 123 },
      billingCycleAnchor: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalled();
  });
});

// ---- Call sites ----
//
// A downgrade of an existing membership to NONE means the user effectively
// left the org, so update call sites must sync it as removeUser — the service
// itself skips NONE events (that skip is for memberships CREATED as NONE).
// Exercised end-to-end: call site → real SfdcService → mocked fetch.

function buildOwnerSession(orgId: string): Session {
  return {
    expires: "1",
    user: {
      id: "owner-user",
      email: "owner@test.com",
      name: "Owner",
      canCreateOrganizations: true,
      organizations: [
        {
          id: orgId,
          name: "Test Org",
          role: Role.OWNER,
          plan: "cloud:team",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
      featureFlags: {
        searchBar: false,
        excludeClickhouseRead: false,
        templateFlag: true,
        v4BetaToggleVisible: false,
        observationEvals: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:team",
    },
  };
}

function createOwnerCaller(orgId: string) {
  const ctx = createInnerTRPCContext({
    session: buildOwnerSession(orgId),
    headers: {},
  });
  return appRouter.createCaller({
    ...ctx,
    prisma: prismaMock as unknown as PrismaClient,
  });
}

function createMockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & NextApiResponse;
}

describe("call site: tRPC members.updateOrgMembership", () => {
  const membership = {
    id: "om-1",
    orgId: "org-1",
    userId: "member-1",
    role: "ADMIN",
    user: { email: "member@test.com" },
  };

  it("syncs a downgrade to NONE as removeUser", async () => {
    prismaMock.organizationMembership.findFirst.mockResolvedValueOnce(
      membership,
    );
    prismaMock.organizationMembership.update.mockResolvedValueOnce({
      ...membership,
      role: "NONE",
    });
    fetchMock.mockResolvedValueOnce(emptyOkResponse());

    await createOwnerCaller("org-1").members.updateOrgMembership({
      orgId: "org-1",
      orgMembershipId: "om-1",
      role: Role.NONE,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      type: "removeUser",
      orgId: "org-1",
      userId: "member-1",
      email: "member@test.com",
    });
    expect(body.role).toBeUndefined();
  });

  it("syncs a change between real roles as setUserRole", async () => {
    prismaMock.organizationMembership.findFirst.mockResolvedValueOnce(
      membership,
    );
    prismaMock.organizationMembership.update.mockResolvedValueOnce({
      ...membership,
      role: "MEMBER",
    });
    fetchMock.mockResolvedValueOnce(emptyOkResponse());

    await createOwnerCaller("org-1").members.updateOrgMembership({
      orgId: "org-1",
      orgMembershipId: "om-1",
      role: Role.MEMBER,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      type: "setUserRole",
      orgId: "org-1",
      userId: "member-1",
      email: "member@test.com",
      role: "DEVELOPER",
    });
  });
});

describe("call site: admin API handleUpdateMembership", () => {
  const member = { id: "member-1", email: "member@test.com", name: "Member" };

  it("syncs a downgrade to NONE as removeUser", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(member);
    prismaMock.organizationMembership.upsert.mockResolvedValueOnce({
      orgId: "org-1",
      userId: "member-1",
      role: "NONE",
    });
    fetchMock.mockResolvedValueOnce(emptyOkResponse());

    const req = {
      body: { userId: "member-1", role: "NONE" },
    } as NextApiRequest;
    const res = createMockRes();
    await handleUpdateMembership(req, res, "org-1");

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      type: "removeUser",
      orgId: "org-1",
      userId: "member-1",
      email: "member@test.com",
    });
    expect(body.role).toBeUndefined();
  });

  it("syncs a real role as setUserRole", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(member);
    prismaMock.organizationMembership.upsert.mockResolvedValueOnce({
      orgId: "org-1",
      userId: "member-1",
      role: "MEMBER",
    });
    fetchMock.mockResolvedValueOnce(emptyOkResponse());

    const req = {
      body: { userId: "member-1", role: "MEMBER" },
    } as NextApiRequest;
    const res = createMockRes();
    await handleUpdateMembership(req, res, "org-1");

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({
      type: "setUserRole",
      orgId: "org-1",
      userId: "member-1",
      email: "member@test.com",
      role: "DEVELOPER",
    });
  });
});

describe("call site: tRPC organizations.create", () => {
  // upsertOrg creates the SFDC Account but does not link the creator; the
  // create flow must also fire setUserRole to establish the OWNER bridge.
  it("creates the account AND links the OWNER (upsertOrg + setUserRole)", async () => {
    prismaMock.organization.create.mockResolvedValueOnce({
      id: "org-new",
      name: "New Org",
      createdAt: ORG_CREATED_AT,
    });
    // [0] upsertOrg (Account), [1] setUserRole (OWNER member bridge)
    fetchMock
      .mockResolvedValueOnce(emptyOkResponse())
      .mockResolvedValueOnce(emptyOkResponse());

    await createOwnerCaller("org-1").organizations.create({ name: "New Org" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const upsertOrgBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(upsertOrgBody).toMatchObject({
      type: "updateOrg",
      orgId: "org-new",
      orgName: "New Org",
      createdAt: ORG_CREATED_AT_ISO_DATE,
      plan: "Hobby", // a freshly created org is always on Hobby
    });
    // Mulesoft ignores user fields on updateOrg — they must not be sent.
    expect(upsertOrgBody).not.toHaveProperty("userId");
    expect(upsertOrgBody).not.toHaveProperty("email");
    expect(upsertOrgBody).not.toHaveProperty("role");
    expect(upsertOrgBody).not.toHaveProperty("convertedToPaidAt");

    const setRoleBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(setRoleBody).toMatchObject({
      type: "setUserRole",
      orgId: "org-new",
      userId: "owner-user",
      email: "owner@test.com",
      role: "ADMIN",
    });
  });
});

describe("call site: createProjectMembershipsOnSignup", () => {
  // Pins the signup cascade payloads and that the lead-source lookup runs
  // against pending invitations BEFORE invitation processing consumes them.
  const overriddenEnvKeys = [
    "NEXT_PUBLIC_DEMO_ORG_ID",
    "NEXT_PUBLIC_DEMO_PROJECT_ID",
    "LANGFUSE_DEFAULT_ORG_ID",
    "LANGFUSE_DEFAULT_PROJECT_ID",
    "LANGFUSE_ALLOWED_ORGANIZATION_CREATORS",
  ] as const;
  const savedEnv: Record<string, unknown> = {};

  beforeEach(() => {
    for (const key of overriddenEnvKeys) {
      savedEnv[key] = envMock[key];
      envMock[key] = undefined;
    }
    // First user lookup fetches the signup date for the lead; the later
    // v4-rollout lookup (selects v4BetaEnabled) must miss so that block is
    // skipped.
    prismaMock.user.findUnique.mockImplementation(async (args: unknown) => {
      const select = (args as { select?: Record<string, unknown> })?.select;
      return select?.createdAt && !select?.v4BetaEnabled
        ? { createdAt: SIGNUP_AT }
        : null;
    });
    fetchMock.mockImplementation(async () => emptyOkResponse());
  });

  afterEach(() => {
    Object.assign(envMock, savedEnv);
    prismaMock.user.findUnique.mockReset();
    prismaMock.user.findUnique.mockImplementation(async () => null);
    fetchMock.mockReset();
  });

  it("organic signup: Signup lead with the user's createdAt, then starter org + OWNER bridge", async () => {
    prismaMock.organization.create.mockResolvedValueOnce({
      id: "org-starter",
      name: "New User's Organization",
      createdAt: ORG_CREATED_AT,
    });

    await createProjectMembershipsOnSignup(
      { id: "user-new", email: "new@test.com", name: "New User" },
      { userWasJustCreated: true },
    );

    // [0] upsertUser (lead), [1] upsertOrg (starter org), [2] setUserRole
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const leadBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(leadBody).toMatchObject({
      userId: "user-new",
      email: "new@test.com",
      createdAt: SIGNUP_AT_ISO_SECONDS,
      leadSource: "Langfuse Cloud Signup",
    });

    const orgBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(orgBody).toMatchObject({
      type: "updateOrg",
      orgId: "org-starter",
      createdAt: ORG_CREATED_AT_ISO_DATE,
      plan: "Hobby",
    });
    expect(orgBody).not.toHaveProperty("userId");

    const bridgeBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(bridgeBody).toMatchObject({
      type: "setUserRole",
      orgId: "org-starter",
      userId: "user-new",
      role: "ADMIN", // OWNER -> ADMIN
    });
  });

  it("invited signup: Invite lead; the invited org is linked and no starter org is provisioned", async () => {
    prismaMock.membershipInvitation.findFirst.mockResolvedValueOnce({
      id: "inv-1",
    });
    prismaMock.membershipInvitation.findMany.mockResolvedValueOnce([
      {
        id: "inv-1",
        orgId: "org-9",
        orgRole: "MEMBER",
        projectId: "proj-9",
        projectRole: "MEMBER",
        email: "invitee@test.com",
      },
    ]);

    await createProjectMembershipsOnSignup(
      { id: "user-invited", email: "invitee@test.com", name: "Invitee" },
      { userWasJustCreated: true },
    );

    // [0] upsertUser (lead), [1] setUserRole for the accepted invitation
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const leadBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(leadBody).toMatchObject({
      userId: "user-invited",
      createdAt: SIGNUP_AT_ISO_SECONDS,
      leadSource: "Langfuse Cloud Invite",
    });

    const bridgeBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(bridgeBody).toMatchObject({
      type: "setUserRole",
      orgId: "org-9",
      userId: "user-invited",
      email: "invitee@test.com",
      role: "DEVELOPER", // MEMBER -> DEVELOPER
    });
  });
});
