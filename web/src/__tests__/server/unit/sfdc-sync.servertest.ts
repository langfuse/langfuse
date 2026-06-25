import { describe, it, expect, vi, beforeEach } from "vitest";

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
        findUnique: vi.fn(async (): Promise<unknown> => null),
        update: vi.fn(async () => ({})),
      },
      organization: {
        findUnique: vi.fn(
          async (): Promise<{ sfdcOrgId: string | null } | null> => null,
        ),
        update: vi.fn(async () => ({})),
        create: vi.fn(
          async (): Promise<unknown> => ({ id: "org-new", name: "New Org" }),
        ),
      },
      organizationMembership: {
        findFirst: vi.fn(async (): Promise<unknown> => null),
        count: vi.fn(async () => 1),
        update: vi.fn(async (): Promise<unknown> => ({})),
        upsert: vi.fn(async (): Promise<unknown> => ({})),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      // tRPC organizations.create wraps its writes in a transaction; run the
      // callback with prismaMock standing in for the tx client.
      $transaction: vi.fn(
        async (cb: (tx: unknown) => Promise<unknown>): Promise<unknown> =>
          cb(prismaMock),
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
} from "@/src/ee/features/sfdc-sync/server";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { handleUpdateMembership } from "@/src/ee/features/admin-api/server/memberships";
import { Role } from "@langfuse/shared";
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
  it("sends isLangfuse + companyName sentinel + basic-auth", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    const sfdc = SfdcService.tryCreate();
    expect(sfdc).not.toBeNull();
    await sfdc!.upsertUser({
      userId: "user-123",
      email: "u@example.com",
      name: "Test User",
    });
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
    });
  });

  it("uses caller-provided companyName when given", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertUser({
      userId: "u1",
      email: "u@example.com",
      name: "U",
      companyName: "Acme Inc",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.companyName).toBe("Acme Inc");
  });

  it.each([null, undefined, ""])(
    "falls back to email as fullName when name is %s",
    async (name) => {
      fetchMock.mockResolvedValueOnce(emptyOkResponse());
      await SfdcService.tryCreate()!.upsertUser({
        userId: "u1",
        email: "u@example.com",
        name,
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.fullName).toBe("u@example.com");
    },
  );

  it("skips without calling fetch when email is missing", async () => {
    await SfdcService.tryCreate()!.upsertUser({
      userId: "u1",
      email: null,
      name: "U",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it("treats the plain-text 'Success' ack as success — no warn, no persistence", async () => {
    // /manage-user never returns JSON or an id; CH Cloud discards this
    // response too.
    fetchMock.mockResolvedValueOnce(new Response("Success", { status: 200 }));
    await SfdcService.tryCreate()!.upsertUser({
      userId: "user-42",
      email: "u@example.com",
      name: "U",
    });
    expect(loggerMock.warn).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not throw on non-2xx; logs an error instead", async () => {
    fetchMock.mockResolvedValueOnce(nonOkResponse(500));
    await SfdcService.tryCreate()!.upsertUser({
      userId: "user-42",
      email: "u@example.com",
      name: "U",
    });
    expect(loggerMock.error).toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not throw on fetch network error; logs an error instead", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      SfdcService.tryCreate()!.upsertUser({
        userId: "user-42",
        email: "u@example.com",
        name: "U",
      }),
    ).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });

  it("never rejects on invalid email — logs warn and skips fetch", async () => {
    await expect(
      SfdcService.tryCreate()!.upsertUser({
        userId: "u",
        email: "not-an-email",
        name: "U",
      }),
    ).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe("SfdcService.upsertOrg", () => {
  it("sends type:updateOrg + isLangfuse + mapped role", async () => {
    fetchMock.mockResolvedValueOnce(emptyOkResponse());
    await SfdcService.tryCreate()!.upsertOrg({
      orgId: "org-1",
      orgName: "Org One",
      userId: "user-1",
      email: "u@example.com",
      role: "OWNER",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mulesoft.test/manage-org");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      isLangfuse: true,
      type: "updateOrg",
      orgId: "org-1",
      orgName: "Org One",
      userId: "user-1",
      email: "u@example.com",
      role: "ADMIN",
      // Mulesoft's updateOrg flow 500s when the CH service counts are
      // missing (null > 0 comparison in DataWeave) — must always be sent.
      numServicesAws: 0,
      numServicesGcp: 0,
      numServicesAzure: 0,
    });
  });

  it("persists sfdcOrgId on 2xx with id in response", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-o-9" }));
    await SfdcService.tryCreate()!.upsertOrg({
      orgId: "org-9",
      orgName: "Org Nine",
      userId: "user-1",
      email: "u@example.com",
      role: "OWNER",
    });
    expect(prismaMock.organization.update).toHaveBeenCalledWith({
      where: { id: "org-9" },
      data: { sfdcOrgId: "sfdc-o-9" },
    });
  });

  it("does not persist when the response omits sfdcOrgId", async () => {
    fetchMock.mockResolvedValueOnce(okJsonResponse({}));
    await SfdcService.tryCreate()!.upsertOrg({
      orgId: "org-9",
      orgName: "Org Nine",
      userId: "user-1",
      email: "u@example.com",
      role: "OWNER",
    });
    expect(prismaMock.organization.update).not.toHaveBeenCalled();
  });

  it("logs error on mismatched existing sfdcOrgId but does NOT overwrite", async () => {
    prismaMock.organization.findUnique.mockResolvedValueOnce({
      sfdcOrgId: "sfdc-old",
    });
    fetchMock.mockResolvedValueOnce(okJsonResponse({ sfdcOrgId: "sfdc-new" }));
    await SfdcService.tryCreate()!.upsertOrg({
      orgId: "org-9",
      orgName: "Org Nine",
      userId: "user-1",
      email: "u@example.com",
      role: "OWNER",
    });
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
      SfdcService.tryCreate()!.upsertOrg({
        orgId: "org-9",
        orgName: "Org Nine",
        userId: "user-1",
        email: "u@example.com",
        role: "OWNER",
      }),
    ).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });
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
        excludeClickhouseRead: false,
        templateFlag: true,
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
      userId: "owner-user",
      email: "owner@test.com",
      role: "ADMIN", // OWNER -> ADMIN
    });

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
