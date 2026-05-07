import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { prisma } from "@langfuse/shared/src/db";
import { decrypt } from "@langfuse/shared/encryption";
import { Role } from "@langfuse/shared";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";

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
