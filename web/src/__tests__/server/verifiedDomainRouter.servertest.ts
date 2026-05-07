import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { resolveTxtFresh } from "@/src/ee/features/verified-domains/server/dnsLookup";
import { prisma } from "@langfuse/shared/src/db";
import { Role } from "@langfuse/shared";
import { TRPCError } from "@trpc/server";
import type { Session } from "next-auth";
import type { Mock } from "vitest";
import { v4 as uuidv4 } from "uuid";

vi.mock("@/src/ee/features/verified-domains/server/dnsLookup", () => ({
  resolveTxtFresh: vi.fn(),
}));

const resolveTxtMock = resolveTxtFresh as unknown as Mock;

beforeEach(() => {
  resolveTxtMock.mockReset();
});

async function createTestOrg() {
  const orgId = uuidv4();
  const userId = uuidv4();

  const org = await prisma.organization.create({
    data: { id: orgId, name: `VerifiedDomain Org ${orgId.slice(0, 8)}` },
  });

  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `vd-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });

  return { org, user };
}

function createSession(
  user: { id: string; email: string | null; name: string | null },
  org: { id: string; name: string },
  role: Role,
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
          plan: "cloud:enterprise",
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

async function prepareWithRole(role: Role) {
  const { org, user } = await createTestOrg();
  await prisma.organizationMembership.create({
    data: { userId: user.id, orgId: org.id, role },
  });
  const session = createSession(user, org, role);
  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });
  return { org, user, session, caller };
}

const prepare = () => prepareWithRole(Role.OWNER);

describe("verifiedDomainRouter.create", () => {
  it("creates a pending row and returns DNS record details", async () => {
    const { org, user, caller } = await prepare();
    const domain = `acme-${uuidv4().slice(0, 8)}.com`;

    const result = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    expect(result.domain).toBe(domain);
    expect(result.verifiedAt).toBeNull();
    expect(result.recordHost).toBe("_langfuse-verification");
    expect(result.recordValue).toMatch(/^langfuse-verify=/);

    const row = await prisma.verifiedDomain.findUnique({ where: { domain } });
    expect(row?.organizationId).toBe(org.id);
    expect(row?.createdByUserId).toBe(user.id);
  });

  it("is idempotent for the same org (returns existing row)", async () => {
    const { org, caller } = await prepare();
    const domain = `idem-${uuidv4().slice(0, 8)}.com`;

    const first = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });
    const second = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    expect(second.id).toBe(first.id);
    expect(second.recordValue).toBe(first.recordValue);

    const count = await prisma.verifiedDomain.count({ where: { domain } });
    expect(count).toBe(1);
  });

  it("returns CONFLICT when another org has claimed the domain", async () => {
    const a = await prepare();
    const b = await prepare();
    const domain = `conflict-${uuidv4().slice(0, 8)}.com`;

    await a.caller.verifiedDomain.create({ orgId: a.org.id, domain });

    await expect(
      b.caller.verifiedDomain.create({ orgId: b.org.id, domain }),
    ).rejects.toThrow(TRPCError);
    await expect(
      b.caller.verifiedDomain.create({ orgId: b.org.id, domain }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects callers without organization:update scope (MEMBER role)", async () => {
    const { org, caller } = await prepareWithRole(Role.MEMBER);
    const domain = `forbidden-${uuidv4().slice(0, 8)}.com`;

    await expect(
      caller.verifiedDomain.create({ orgId: org.id, domain }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("emits an audit log on create", async () => {
    const { org, user, caller } = await prepare();
    const domain = `audit-${uuidv4().slice(0, 8)}.com`;

    const result = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    const log = await prisma.auditLog.findFirst({
      where: {
        resourceType: "verifiedDomain",
        resourceId: result.id,
        action: "create",
      },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(user.id);
    expect(log?.orgId).toBe(org.id);
  });
});

describe("verifiedDomainRouter.list", () => {
  it("returns rows scoped to the caller's org", async () => {
    const { org, caller } = await prepare();
    const a = `list-a-${uuidv4().slice(0, 8)}.com`;
    const b = `list-b-${uuidv4().slice(0, 8)}.com`;

    await caller.verifiedDomain.create({ orgId: org.id, domain: a });
    await caller.verifiedDomain.create({ orgId: org.id, domain: b });

    const rows = await caller.verifiedDomain.list({ orgId: org.id });
    const domains = rows.map((r) => r.domain).sort();
    expect(domains).toEqual([a, b].sort());

    rows.forEach((r) => {
      expect(r.recordHost).toBe("_langfuse-verification");
      expect(r.recordValue).toMatch(/^langfuse-verify=/);
    });
  });
});

describe("verifiedDomainRouter.verify", () => {
  it("sets verifiedAt and emits an audit log when the TXT record matches", async () => {
    const { org, caller } = await prepare();
    const domain = `verify-ok-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    resolveTxtMock.mockResolvedValueOnce([
      ["some-other-record"],
      [created.recordValue],
    ]);

    const result = await caller.verifiedDomain.verify({
      orgId: org.id,
      id: created.id,
    });

    expect(result.verifiedAt).not.toBeNull();
    expect(resolveTxtMock).toHaveBeenCalledWith(
      `${created.recordHost}.${created.domain}`,
    );

    const log = await prisma.auditLog.findFirst({
      where: {
        resourceType: "verifiedDomain",
        resourceId: created.id,
        action: "verify",
      },
    });
    expect(log).not.toBeNull();
  });

  it("joins multi-chunk TXT record values before matching", async () => {
    const { org, caller } = await prepare();
    const domain = `verify-chunked-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    const half = Math.floor(created.recordValue.length / 2);
    const chunked = [
      [created.recordValue.slice(0, half), created.recordValue.slice(half)],
    ];
    resolveTxtMock.mockResolvedValueOnce(chunked);

    const result = await caller.verifiedDomain.verify({
      orgId: org.id,
      id: created.id,
    });
    expect(result.verifiedAt).not.toBeNull();
  });

  it("returns PRECONDITION_FAILED when no TXT record matches", async () => {
    const { org, caller } = await prepare();
    const domain = `verify-mismatch-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    resolveTxtMock.mockResolvedValueOnce([["langfuse-verify=wrong"]]);

    await expect(
      caller.verifiedDomain.verify({ orgId: org.id, id: created.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const row = await prisma.verifiedDomain.findUnique({ where: { domain } });
    expect(row?.verifiedAt).toBeNull();
  });

  it("returns PRECONDITION_FAILED when DNS lookup throws", async () => {
    const { org, caller } = await prepare();
    const domain = `verify-nxdomain-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    const err = Object.assign(new Error("queryTxt ENOTFOUND"), {
      code: "ENOTFOUND",
    });
    resolveTxtMock.mockRejectedValueOnce(err);

    await expect(
      caller.verifiedDomain.verify({ orgId: org.id, id: created.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("is a no-op for an already-verified row", async () => {
    const { org, caller } = await prepare();
    const domain = `verify-noop-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    resolveTxtMock.mockResolvedValueOnce([[created.recordValue]]);
    await caller.verifiedDomain.verify({ orgId: org.id, id: created.id });

    const second = await caller.verifiedDomain.verify({
      orgId: org.id,
      id: created.id,
    });

    expect(second.verifiedAt).not.toBeNull();
    expect(resolveTxtMock).toHaveBeenCalledTimes(1);
  });

  it("returns NOT_FOUND when the row belongs to a different org", async () => {
    const a = await prepare();
    const b = await prepare();

    const created = await a.caller.verifiedDomain.create({
      orgId: a.org.id,
      domain: `cross-org-${uuidv4().slice(0, 8)}.com`,
    });

    await expect(
      b.caller.verifiedDomain.verify({ orgId: b.org.id, id: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("verifiedDomainRouter.delete", () => {
  it("removes the row and emits an audit log", async () => {
    const { org, caller } = await prepare();
    const domain = `delete-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });

    await caller.verifiedDomain.delete({ orgId: org.id, id: created.id });

    const row = await prisma.verifiedDomain.findUnique({ where: { domain } });
    expect(row).toBeNull();

    const log = await prisma.auditLog.findFirst({
      where: {
        resourceType: "verifiedDomain",
        resourceId: created.id,
        action: "delete",
      },
    });
    expect(log).not.toBeNull();
  });

  it("returns NOT_FOUND when the row belongs to a different org", async () => {
    const a = await prepare();
    const b = await prepare();

    const created = await a.caller.verifiedDomain.create({
      orgId: a.org.id,
      domain: `delete-cross-${uuidv4().slice(0, 8)}.com`,
    });

    await expect(
      b.caller.verifiedDomain.delete({ orgId: b.org.id, id: created.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns PRECONDITION_FAILED when an SSO configuration exists for the domain", async () => {
    const { org, caller } = await prepare();
    const domain = `delete-with-sso-${uuidv4().slice(0, 8)}.com`;

    const created = await caller.verifiedDomain.create({
      orgId: org.id,
      domain,
    });
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
      caller.verifiedDomain.delete({ orgId: org.id, id: created.id }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    const row = await prisma.verifiedDomain.findUnique({ where: { domain } });
    expect(row).not.toBeNull();
  });

  it("rejects callers without organization:update scope (MEMBER role)", async () => {
    const owner = await prepare();
    const member = await prepareWithRole(Role.MEMBER);

    const created = await owner.caller.verifiedDomain.create({
      orgId: owner.org.id,
      domain: `delete-rbac-${uuidv4().slice(0, 8)}.com`,
    });

    await expect(
      member.caller.verifiedDomain.delete({
        orgId: member.org.id,
        id: created.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
