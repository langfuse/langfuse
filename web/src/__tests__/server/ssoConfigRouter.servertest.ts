import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { Role } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

// `validateSsoConfig` does a live OIDC discovery fetch. Default mock returns
// a valid response that mirrors the issuer; individual tests override.
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  mockDiscoveryOk("https://example.okta.com");
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function mockDiscoveryOk(expectedIssuer: string) {
  // Construct a fresh Response per call — Response bodies are single-use and
  // tests that call `save` more than once would otherwise hit a consumed body.
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          issuer: expectedIssuer,
          authorization_endpoint: `${expectedIssuer}/authorize`,
          token_endpoint: `${expectedIssuer}/oauth/token`,
          jwks_uri: `${expectedIssuer}/.well-known/jwks.json`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
}

async function createTestOrg() {
  const orgId = uuidv4();
  const userId = uuidv4();

  const org = await prisma.organization.create({
    data: { id: orgId, name: `SsoConfig Org ${orgId.slice(0, 8)}` },
  });

  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `ssoc-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });

  return { org, user };
}

function createSession(
  user: { id: string; email: string | null; name: string | null },
  org: { id: string; name: string },
  role: Role,
  plan: "cloud:enterprise" | "cloud:hobby",
): Session {
  return {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role,
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          projects: [],
        },
      ],
      featureFlags: {
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
      selfHostedInstancePlan: "cloud:enterprise",
    },
  };
}

async function prepareWithRole(
  role: Role,
  plan: "cloud:enterprise" | "cloud:hobby" = "cloud:enterprise",
) {
  const { org, user } = await createTestOrg();
  await prisma.organizationMembership.create({
    data: { userId: user.id, orgId: org.id, role },
  });
  const session = createSession(user, org, role, plan);
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });
  return { org, user, session, caller };
}

const prepare = () => prepareWithRole(Role.OWNER);

async function addVerifiedDomain(
  orgId: string,
  domain: string,
  verified = true,
) {
  return prisma.verifiedDomain.create({
    data: {
      organizationId: orgId,
      domain,
      verifiedAt: verified ? new Date() : null,
    },
  });
}

const samplePayload = (domain: string) => ({
  domain,
  authProvider: "okta" as const,
  authConfig: {
    clientId: "client-123",
    clientSecret: "super-secret-value",
    issuer: "https://example.okta.com",
    allowDangerousEmailAccountLinking: false,
  },
});

describe("ssoConfigRouter.save", () => {
  it("rejects when the domain has no verified VerifiedDomain row for the org", async () => {
    const { org, caller } = await prepare();
    const domain = `unverified-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain, /* verified */ false);

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).toBeNull();
  });

  it("rejects OIDC issuers that pass the https:// prefix but fail URL grammar", async () => {
    // Pre-PR these fields used z.url(); the scheme-tightening refactor
    // dropped grammar validation. `https://` (scheme only) and `https:// foo`
    // both pass startsWith but are not valid URLs.
    const { org, caller } = await prepare();
    const domain = `bad-grammar-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    for (const badIssuer of ["https://", "https:// foo"]) {
      await expect(
        caller.ssoConfig.save({
          orgId: org.id,
          payload: {
            ...samplePayload(domain),
            authConfig: {
              ...samplePayload(domain).authConfig,
              issuer: badIssuer,
            },
          },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("rejects Custom OIDC payloads with an empty name", async () => {
    // The form labels Display Name as a user-facing required field; reject
    // empty values at the schema layer so the form contract is enforced.
    const { org, caller } = await prepare();
    const domain = `custom-empty-name-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await expect(
      caller.ssoConfig.save({
        orgId: org.id,
        payload: {
          domain,
          authProvider: "custom" as const,
          authConfig: {
            name: "",
            clientId: "client-123",
            clientSecret: "super-secret",
            issuer: "https://example.okta.com",
            allowDangerousEmailAccountLinking: false,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).toBeNull();
  });

  it("rejects Azure AD payloads with an empty tenantId", async () => {
    // Empty tenantId saves cleanly otherwise but locks all users out at
    // sign-in (NextAuth builds https://login.microsoftonline.com//v2.0/...).
    const { org, caller } = await prepare();
    const domain = `azure-empty-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await expect(
      caller.ssoConfig.save({
        orgId: org.id,
        payload: {
          domain,
          authProvider: "azure-ad" as const,
          authConfig: {
            clientId: "client-123",
            clientSecret: "super-secret",
            tenantId: "",
            allowDangerousEmailAccountLinking: false,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).toBeNull();
  });

  it("rejects when the verified domain belongs to a different org", async () => {
    const a = await prepare();
    const b = await prepare();
    const domain = `cross-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(a.org.id, domain, true);

    await expect(
      b.caller.ssoConfig.save({
        orgId: b.org.id,
        payload: samplePayload(domain),
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("creates a row, encrypts clientSecret, and emits an audit log", async () => {
    const { org, user, caller } = await prepare();
    const domain = `create-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    const result = await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    expect(result.domain).toBe(domain);
    expect(result.authProvider).toBe("okta");
    // clientSecret must not appear in returned authConfig
    expect((result.authConfig as Record<string, unknown>).clientSecret).toBe(
      undefined,
    );

    const stored = await prisma.ssoConfig.findUniqueOrThrow({
      where: { domain },
    });
    const storedConfig = stored.authConfig as Record<string, unknown>;
    expect(storedConfig.clientId).toBe("client-123");
    // clientSecret on disk is the encrypted blob, not the plaintext
    expect(storedConfig.clientSecret).not.toBe("super-secret-value");
    expect(decrypt(storedConfig.clientSecret as string)).toBe(
      "super-secret-value",
    );

    const log = await prisma.auditLog.findFirst({
      where: {
        resourceType: "ssoConfig",
        resourceId: domain,
        action: "create",
      },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(user.id);
    expect(log?.orgId).toBe(org.id);
    // before/after JSON must not contain plaintext clientSecret
    expect(log?.after).not.toContain("super-secret-value");
    expect(log?.before).toBeNull();
  });

  it("is idempotent — saving twice with the same payload yields one row", async () => {
    const { org, caller } = await prepare();
    const domain = `idem-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });
    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    const count = await prisma.ssoConfig.count({ where: { domain } });
    expect(count).toBe(1);
  });

  it("replaces the existing row on update and records action='update' in the audit log", async () => {
    const { org, caller } = await prepare();
    const domain = `update-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });
    await caller.ssoConfig.save({
      orgId: org.id,
      payload: {
        ...samplePayload(domain),
        authConfig: {
          ...samplePayload(domain).authConfig,
          clientId: "new-client-id",
          clientSecret: "rotated-secret",
        },
      },
    });

    const stored = await prisma.ssoConfig.findUniqueOrThrow({
      where: { domain },
    });
    const cfg = stored.authConfig as Record<string, unknown>;
    expect(cfg.clientId).toBe("new-client-id");
    expect(decrypt(cfg.clientSecret as string)).toBe("rotated-secret");

    const updateLog = await prisma.auditLog.findFirst({
      where: {
        resourceType: "ssoConfig",
        resourceId: domain,
        action: "update",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(updateLog).not.toBeNull();
    expect(updateLog?.before).not.toBeNull();
    expect(updateLog?.before).not.toContain("super-secret-value");
    expect(updateLog?.before).not.toContain("rotated-secret");
  });

  it("preserves advanced authConfig fields on update for the same provider", async () => {
    // Legacy support-endpoint configs may set scope, tokenEndpointAuthMethod,
    // idTokenSignedResponseAlg, etc. The self-service form doesn't surface
    // those fields, so a naive whole-row replace would silently wipe them
    // when the admin re-enters the secret. Merge instead.
    const { org, caller } = await prepare();
    const domain = `merge-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider: "okta",
        authConfig: {
          clientId: "old-client",
          clientSecret: encrypt("old-secret"),
          issuer: "https://example.okta.com",
          tokenEndpointAuthMethod: "private_key_jwt",
          idTokenSignedResponseAlg: "RS256",
        },
      },
    });

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    const stored = await prisma.ssoConfig.findUniqueOrThrow({
      where: { domain },
    });
    const cfg = stored.authConfig as Record<string, unknown>;
    // Form-supplied fields take priority on the merge.
    expect(cfg.clientId).toBe("client-123");
    expect(decrypt(cfg.clientSecret as string)).toBe("super-secret-value");
    // Advanced fields the form doesn't carry are preserved.
    expect(cfg.tokenEndpointAuthMethod).toBe("private_key_jwt");
    expect(cfg.idTokenSignedResponseAlg).toBe("RS256");
  });

  it("resets authConfig fields when the provider changes", async () => {
    // Switching providers is an explicit reset — Custom-only fields like
    // `name`/`scope` aren't valid in another provider's schema and shouldn't
    // bleed across.
    const { org, caller } = await prepare();
    const domain = `switch-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider: "custom",
        authConfig: {
          name: "Old Custom",
          clientId: "old-client",
          clientSecret: encrypt("old-secret"),
          issuer: "https://old.example.com",
          scope: "openid email custom-scope",
        },
      },
    });

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    const stored = await prisma.ssoConfig.findUniqueOrThrow({
      where: { domain },
    });
    const cfg = stored.authConfig as Record<string, unknown>;
    expect(stored.authProvider).toBe("okta");
    expect(cfg.name).toBeUndefined();
    expect(cfg.scope).toBeUndefined();
  });

  it("rejects callers without organization:update scope (MEMBER role)", async () => {
    const { org, caller } = await prepareWithRole(Role.MEMBER);
    const domain = `forbidden-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when the org plan lacks the cloud-multi-tenant-sso entitlement", async () => {
    const { org, caller } = await prepareWithRole(Role.OWNER, "cloud:hobby");
    const domain = `entitlement-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ssoConfigRouter.get", () => {
  it("returns rows scoped to verified domains for the org with clientSecret stripped", async () => {
    const { org, caller } = await prepare();
    const domain = `get-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    const rows = await caller.ssoConfig.get({ orgId: org.id });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.domain).toBe(domain);
    const cfg = row.authConfig as Record<string, unknown>;
    expect(cfg.clientId).toBe("client-123");
    expect(cfg.clientSecret).toBe(undefined);
    expect(cfg.issuer).toBe("https://example.okta.com");
  });

  it("does not return rows for unverified domains", async () => {
    const { org, caller } = await prepare();
    const verified = `verified-${uuidv4().slice(0, 8)}.com`;
    const pending = `pending-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, verified, true);
    await addVerifiedDomain(org.id, pending, false);

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(verified),
    });
    // Insert a stale config directly (mirrors a domain that was previously
    // verified but later un-verified, or one that pre-dates the
    // verified-domains feature).
    await prisma.ssoConfig.create({
      data: {
        domain: pending,
        authProvider: "okta",
        authConfig: {
          clientId: "x",
          clientSecret: "y",
          issuer: "https://x.okta.com",
        },
      },
    });

    const rows = await caller.ssoConfig.get({ orgId: org.id });
    const domains = rows.map((r) => r.domain);
    expect(domains).toContain(verified);
    expect(domains).not.toContain(pending);
  });

  it("does not return rows for verified domains belonging to a different org", async () => {
    const a = await prepare();
    const b = await prepare();
    const domainA = `org-a-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(a.org.id, domainA);
    await a.caller.ssoConfig.save({
      orgId: a.org.id,
      payload: samplePayload(domainA),
    });

    const rowsB = await b.caller.ssoConfig.get({ orgId: b.org.id });
    expect(rowsB.map((r) => r.domain)).not.toContain(domainA);
  });
});

describe("ssoConfigRouter.delete", () => {
  it("removes the row and emits an audit log", async () => {
    const { org, caller } = await prepare();
    const domain = `delete-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });
    await caller.ssoConfig.delete({ orgId: org.id, domain });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).toBeNull();

    const log = await prisma.auditLog.findFirst({
      where: {
        resourceType: "ssoConfig",
        resourceId: domain,
        action: "delete",
      },
    });
    expect(log).not.toBeNull();
    expect(log?.before).not.toContain("super-secret-value");
  });

  it("returns NOT_FOUND when the domain has no SsoConfig", async () => {
    const { org, caller } = await prepare();
    const domain = `missing-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    await expect(
      caller.ssoConfig.delete({ orgId: org.id, domain }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when the verified domain belongs to a different org", async () => {
    const a = await prepare();
    const b = await prepare();
    const domain = `cross-delete-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(a.org.id, domain);
    await a.caller.ssoConfig.save({
      orgId: a.org.id,
      payload: samplePayload(domain),
    });

    await expect(
      b.caller.ssoConfig.delete({ orgId: b.org.id, domain }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The row must still exist for org A.
    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).not.toBeNull();
  });

  it("returns NOT_FOUND when the caller only holds a pending VerifiedDomain claim", async () => {
    // Guards the legacy-config bypass: an SsoConfig provisioned by the admin
    // REST handler has no VerifiedDomain backing. Without the verifiedAt gate,
    // any org could claim a pending row for that domain and delete the
    // active config out from under the real owner.
    const { org, caller } = await prepare();
    const domain = `pending-delete-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain, /* verified */ false);
    await prisma.ssoConfig.create({
      data: {
        domain,
        authProvider: "okta",
        authConfig: {
          clientId: "x",
          clientSecret: "y",
          issuer: "https://x.okta.com",
        },
      },
    });

    await expect(
      caller.ssoConfig.delete({ orgId: org.id, domain }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).not.toBeNull();
  });

  it("rejects callers without organization:update scope (MEMBER role)", async () => {
    const owner = await prepare();
    const member = await prepareWithRole(Role.MEMBER);
    const domain = `delete-rbac-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(owner.org.id, domain);
    await owner.caller.ssoConfig.save({
      orgId: owner.org.id,
      payload: samplePayload(domain),
    });

    await expect(
      member.caller.ssoConfig.delete({ orgId: member.org.id, domain }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("ssoConfigRouter.save — IdP discovery validation", () => {
  function discoveryResponse(body: unknown, status = 200) {
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status, headers: { "content-type": "application/json" } },
    );
  }

  it("rejects when the discovery endpoint returns a non-2xx", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-404-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockResolvedValueOnce(discoveryResponse({}, 404));

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const row = await prisma.ssoConfig.findUnique({ where: { domain } });
    expect(row).toBeNull();
  });

  it("rejects when the discovery endpoint is unreachable", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-unreachable-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects when the discovery endpoint redirects (SSRF defense)", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-redirect-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    // `redirect: "error"` means a 3xx surfaces as a fetch rejection. Real
    // IdPs serve `.well-known/openid-configuration` with a 200 directly per
    // OIDC Discovery §4; a redirect is a sign that the configured issuer is
    // either misconfigured or trying to bounce us at an internal endpoint.
    fetchMock.mockRejectedValueOnce(new TypeError("redirect not allowed"));

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects when the discovery body is not valid JSON", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-bad-json-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockResolvedValueOnce(discoveryResponse("not json", 200));

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects when the discovery doc is missing required fields", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-missing-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({ issuer: "https://example.okta.com" }),
    );

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects when the returned issuer does not match the configured one", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-mismatch-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({
        issuer: "https://different.okta.com",
        authorization_endpoint: "https://different.okta.com/authorize",
        token_endpoint: "https://different.okta.com/oauth/token",
        jwks_uri: "https://different.okta.com/.well-known/jwks.json",
      }),
    );

    await expect(
      caller.ssoConfig.save({ orgId: org.id, payload: samplePayload(domain) }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("accepts a discovery doc whose issuer matches modulo trailing slash", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-slash-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    // Auth0-style: discovery returns the issuer with a trailing slash even
    // though we configured it without one.
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({
        issuer: "https://example.okta.com/",
        authorization_endpoint: "https://example.okta.com/authorize",
        token_endpoint: "https://example.okta.com/oauth/token",
        jwks_uri: "https://example.okta.com/.well-known/jwks.json",
      }),
    );

    const result = await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });
    expect(result.domain).toBe(domain);
  });

  it("calls the right discovery URL for the configured issuer", async () => {
    const { org, caller } = await prepare();
    const domain = `discovery-url-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    mockDiscoveryOk("https://example.okta.com");

    await caller.ssoConfig.save({
      orgId: org.id,
      payload: samplePayload(domain),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.okta.com/.well-known/openid-configuration",
      expect.any(Object),
    );
  });

  it("accepts the {tenantid} placeholder in Azure AD multi-tenant discovery responses", async () => {
    // Microsoft returns a literal `{tenantid}` placeholder in the discovery
    // doc for tenantId values "common", "organizations", and "consumers" —
    // the actual tenant is bound at sign-in time per user. A strict
    // equality check would block these legitimate multi-tenant configs.
    const { org, caller } = await prepare();
    const domain = `azure-multi-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    fetchMock.mockResolvedValueOnce(
      discoveryResponse({
        issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
        authorization_endpoint:
          "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        token_endpoint:
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        jwks_uri:
          "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      }),
    );

    const result = await caller.ssoConfig.save({
      orgId: org.id,
      payload: {
        domain,
        authProvider: "azure-ad" as const,
        authConfig: {
          clientId: "azure-client",
          clientSecret: "azure-secret",
          tenantId: "common",
          allowDangerousEmailAccountLinking: false,
        },
      },
    });

    expect(result.domain).toBe(domain);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration",
      expect.any(Object),
    );
  });

  it("still rejects single-tenant Azure AD when the discovery issuer does not match", async () => {
    const { org, caller } = await prepare();
    const domain = `azure-single-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);

    // Specific tenantId — Microsoft returns a real issuer with that tenant
    // GUID, not the placeholder. A mismatch must still throw.
    fetchMock.mockResolvedValueOnce(
      discoveryResponse({
        issuer: "https://login.microsoftonline.com/{tenantid}/v2.0",
        authorization_endpoint: "https://login.microsoftonline.com/x/authorize",
        token_endpoint: "https://login.microsoftonline.com/x/token",
        jwks_uri: "https://login.microsoftonline.com/x/keys",
      }),
    );

    await expect(
      caller.ssoConfig.save({
        orgId: org.id,
        payload: {
          domain,
          authProvider: "azure-ad" as const,
          authConfig: {
            clientId: "azure-client",
            clientSecret: "azure-secret",
            tenantId: "00000000-0000-0000-0000-000000000000",
            allowDangerousEmailAccountLinking: false,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("skips discovery for OAuth-only providers (github)", async () => {
    const { org, caller } = await prepare();
    const domain = `github-skip-${uuidv4().slice(0, 8)}.com`;
    await addVerifiedDomain(org.id, domain);
    fetchMock.mockClear();

    const result = await caller.ssoConfig.save({
      orgId: org.id,
      payload: {
        domain,
        authProvider: "github" as const,
        authConfig: {
          clientId: "gh-client",
          clientSecret: "gh-secret",
          allowDangerousEmailAccountLinking: true,
        },
      },
    });

    expect(result.domain).toBe(domain);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
