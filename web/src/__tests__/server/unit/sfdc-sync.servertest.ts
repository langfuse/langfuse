import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Hoisted mocks ----

const { envMock, prismaMock, loggerMock, fetchMock } = vi.hoisted(() => {
  return {
    envMock: {
      NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "STAGING" as string | undefined,
      MULESOFT_SFDC_USER_URL: "https://mulesoft.test/manage-user" as
        | string
        | undefined,
      MULESOFT_SFDC_ORG_URL: "https://mulesoft.test/manage-org" as
        | string
        | undefined,
      MULESOFT_SFDC_BASIC_AUTH_USER: "mule-user" as string | undefined,
      MULESOFT_SFDC_BASIC_AUTH_PASSWORD: "mule-pass" as string | undefined,
      MULESOFT_SFDC_CAMPAIGN_ID: "campaign-test-id" as string | undefined,
      MULESOFT_SFDC_DEFAULT_COMPANY_NAME: "Acme Corp" as string | undefined,
    },
    prismaMock: {
      user: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
      },
      organization: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
      },
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

vi.mock("@/src/env.mjs", () => ({ env: envMock }));
vi.mock("@langfuse/shared/src/db", () => ({ prisma: prismaMock }));
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
  envMock.MULESOFT_SFDC_CAMPAIGN_ID = "campaign-test-id";
  envMock.MULESOFT_SFDC_DEFAULT_COMPANY_NAME = "Acme Corp";
});

describe("SfdcService — factory gating", () => {
  it("returns null when NEXT_PUBLIC_LANGFUSE_CLOUD_REGION is not set", () => {
    envMock.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;
    expect(SfdcService.tryCreate()).toBeNull();
  });

  it("returns null when any URL env var is missing", () => {
    envMock.MULESOFT_SFDC_USER_URL = undefined;
    expect(SfdcService.tryCreate()).toBeNull();
  });

  it("returns null when any auth env var is missing", () => {
    envMock.MULESOFT_SFDC_BASIC_AUTH_PASSWORD = undefined;
    expect(SfdcService.tryCreate()).toBeNull();
  });

  it("returns null when the campaign ID env var is missing", () => {
    envMock.MULESOFT_SFDC_CAMPAIGN_ID = undefined;
    expect(SfdcService.tryCreate()).toBeNull();
  });

  it("returns a service instance when all env vars are set on Cloud", () => {
    expect(SfdcService.tryCreate()).toBeInstanceOf(SfdcService);
  });

  it("caches the instance across getSfdcService() calls", () => {
    const a = getSfdcService();
    const b = getSfdcService();
    expect(a).not.toBeNull();
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
      companyName: "Acme Corp",
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.companyName).toBe("Acme Corp");
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

  it("does not throw on non-2xx; logs a warn instead", async () => {
    fetchMock.mockResolvedValueOnce(nonOkResponse(500));
    await SfdcService.tryCreate()!.upsertUser({
      userId: "user-42",
      email: "u@example.com",
      name: "U",
    });
    expect(loggerMock.warn).toHaveBeenCalled();
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("does not throw on fetch network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNRESET"));
    await expect(
      SfdcService.tryCreate()!.upsertUser({
        userId: "user-42",
        email: "u@example.com",
        name: "U",
      }),
    ).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalled();
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
  it("sends type:updateOrg + campaign + isLangfuse + raw role", async () => {
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
      role: "OWNER",
      campaign: "campaign-test-id",
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
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe("SfdcService.setUserRole — Langfuse roles are passed through 1:1", () => {
  it.each(["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const)(
    "passes %s through verbatim",
    async (role) => {
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
        role,
        campaign: "campaign-test-id",
      });
    },
  );

  it("skips NONE roles without calling fetch (project-only memberships)", async () => {
    await SfdcService.tryCreate()!.setUserRole({
      orgId: "org-1",
      userId: "user-1",
      email: "u@example.com",
      role: "NONE",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
