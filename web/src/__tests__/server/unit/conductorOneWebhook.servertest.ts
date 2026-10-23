import { createHash } from "node:crypto";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  organization: { findUnique: vi.fn(), findMany: vi.fn() },
  $executeRaw: vi.fn(),
}));
const getSsoProvider = vi.hoisted(() => vi.fn());
const auditLog = vi.hoisted(() => vi.fn());

vi.mock("@/src/env.mjs", () => ({ env: {} }));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: db,
  Prisma: { DbNull: "DbNull" },
  Role: { VIEWER: "VIEWER" },
}));
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("@/src/ee/features/multi-tenant-sso/server", () => ({
  getSsoAuthProviderIdForDomain: getSsoProvider,
}));
vi.mock("@/src/features/audit-logs/auditLog", () => ({ auditLog }));

import {
  handleProvisionTask,
  ProvisionPayloadSchema,
  verifyConductorOneRequest,
} from "@/src/ee/features/support-access/server/conductorOneWebhook";
import {
  getActiveSupportAccessOrgIds,
  getSupportAccessMemberships,
} from "@/src/ee/features/support-access/server/supportAccess";

describe("verifyConductorOneRequest", () => {
  const issuer = "clickhouse.conductor.one";
  const audience = "us.cloud.langfuse.com";
  const body = Buffer.from('{"event":"x"}');
  const bodyHash = createHash("sha256").update(body).digest("base64");
  let key: CryptoKey;
  let unknownKey: CryptoKey;
  let config: Parameters<typeof verifyConductorOneRequest>[2];

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    key = pair.privateKey;
    unknownKey = (await generateKeyPair("RS256")).privateKey;
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "k",
      alg: "RS256",
    };
    config = { issuer, audience, jwks: createLocalJWKSet({ keys: [jwk] }) };
  });

  async function sign(
    claims: JWTPayload = {},
    opts: { key?: CryptoKey; expiresIn?: string } = {},
  ) {
    const { iss = issuer, aud = audience, ...rest } = claims;
    return new SignJWT({ htb_s256: bodyHash, ...rest })
      .setProtectedHeader({ alg: "RS256", kid: "k" })
      .setIssuer(iss)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? "2m")
      .sign(opts.key ?? key);
  }

  const verify = (token: string, rawBody = body) =>
    verifyConductorOneRequest(`Bearer ${token}`, rawBody, config);

  it("accepts a valid token for this body", async () => {
    await expect(verify(await sign())).resolves.toBeUndefined();
  });

  it.each([
    ["another issuer", { iss: "evil.conductor.one" }],
    ["another region's host", { aud: "cloud.langfuse.com" }],
    ["another body's hash", { htb_s256: "AAAA" }],
    ["no body hash", { htb_s256: undefined }],
  ])("rejects %s", async (_, claims) => {
    await expect(verify(await sign(claims))).rejects.toThrow();
  });

  it("rejects a token moved onto a different body", async () => {
    await expect(
      verify(await sign(), Buffer.from('{"event":"y"}')),
    ).rejects.toThrow();
  });

  it("rejects an unknown signing key, an expired token and alg none", async () => {
    await expect(verify(await sign({}, { key: unknownKey }))).rejects.toThrow();
    await expect(
      verify(await sign({}, { expiresIn: "-1m" })),
    ).rejects.toThrow();
    const none = (v: object) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    await expect(
      verify(
        `${none({ alg: "none" })}.${none({ iss: issuer, aud: audience, htb_s256: bodyHash })}.`,
      ),
    ).rejects.toThrow();
  });

  it("rejects missing authorization", async () => {
    for (const authorization of [undefined, "", "Basic abc"]) {
      await expect(
        verifyConductorOneRequest(authorization, body, config),
      ).rejects.toThrow();
    }
  });
});

describe("handleProvisionTask", () => {
  const config = { entitlementId: "ent-1", region: "US" };
  const now = new Date("2026-10-23T12:00:00.000Z");
  const ssoUser = {
    id: "user-1",
    password: null,
    supportAccess: null,
    accounts: [{ provider: "clickhouse.com.okta" }],
  };
  const grant = (grantDuration?: string, appEntitlementId = "ent-1") => ({
    grant: { appEntitlementId, grantDuration },
  });

  function payload(
    o: {
      type?: Record<string, unknown>;
      region?: string;
      email?: string;
    } = {},
  ) {
    return ProvisionPayloadSchema.parse({
      taskView: {
        task: {
          id: "task-1",
          userId: "c1-user",
          type: o.type ?? grant("43200s"),
          form: {
            data: {
              langfuse_region: o.region ?? "US",
              langfuse_organization_id: "org-1",
            },
          },
        },
      },
      expanded: [
        {
          "@type": "type.googleapis.com/c1.api.user.v1.User",
          id: "c1-user",
          email: o.email ?? "eng@clickhouse.com",
        },
      ],
    });
  }

  const run = (p = payload()) => handleProvisionTask(p, config, now);

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(ssoUser);
    db.organization.findUnique.mockResolvedValue({ id: "org-1" });
    getSsoProvider.mockResolvedValue("clickhouse.com.okta");
  });

  it("grants VIEWER until now + duration", async () => {
    expect(await run()).toEqual({
      version: "v1",
      complete: {
        comment: "VIEWER access granted until 2026-10-24T00:00:00.000Z",
      },
    });
    expect(db.$executeRaw).toHaveBeenCalledOnce();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "org-1", action: "grant" }),
    );
  });

  it.each([
    ["another entitlement", payload({ type: grant("3600s", "ent-admin") })],
    ["another region", payload({ region: "EU" })],
    ["no duration (permanent)", payload({ type: grant(undefined) })],
    ["a duration above 12h", payload({ type: grant("86400s") })],
    ["a non-ClickHouse email", payload({ email: "eng@evil-clickhouse.com" })],
  ])("rejects %s", async (_, p) => {
    expect(await run(p)).toHaveProperty("errored");
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["no Langfuse user", null],
    // e.g. created by a customer's SCIM client or an unverified OAuth login
    ["a user without an SSO login", { ...ssoUser, accounts: [] }],
    [
      "a user from another provider",
      { ...ssoUser, accounts: [{ provider: "github" }] },
    ],
    ["a user with a password", { ...ssoUser, password: "hash" }],
  ])("rejects %s", async (_, user) => {
    db.user.findUnique.mockResolvedValue(user);
    expect(await run()).toHaveProperty("errored");
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects when clickhouse.com has no enforced SSO", async () => {
    getSsoProvider.mockResolvedValue(null);
    expect(await run()).toHaveProperty("errored");
  });

  it("rejects an unknown organization", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    expect(await run()).toHaveProperty("errored");
  });

  it("is idempotent for a retried task", async () => {
    db.user.findUnique.mockResolvedValue({
      ...ssoUser,
      supportAccess: {
        "org-1": {
          role: "VIEWER",
          expiresAt: "2026-10-24T00:00:00.000Z",
          c1TaskId: "task-1",
        },
      },
    });
    expect(await run()).toHaveProperty("complete");
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("revokes all support access", async () => {
    const revoke = payload({ type: { revoke: { appEntitlementId: "ent-1" } } });
    expect(await run(revoke)).toHaveProperty("complete");
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { supportAccess: "DbNull" },
    });
  });

  it("ignores revokes for another entitlement", async () => {
    const revoke = payload({ type: { revoke: { appEntitlementId: "other" } } });
    expect(await run(revoke)).toHaveProperty("errored");
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("getActiveSupportAccessOrgIds", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  const entry = (expiresAt: string, role = "VIEWER") => ({
    role,
    expiresAt,
    c1TaskId: "t",
  });

  it("returns only unexpired grants", () => {
    expect(
      getActiveSupportAccessOrgIds(
        {
          active: entry("2026-10-23T13:00:00.000Z"),
          expired: entry("2026-10-23T11:59:59.000Z"),
        },
        now,
      ),
    ).toEqual(["active"]);
  });

  it("grants nothing for malformed values or other roles", () => {
    expect(
      getActiveSupportAccessOrgIds(
        { org: entry("2099-01-01T00:00:00.000Z", "OWNER") },
        now,
      ),
    ).toEqual([]);
    expect(getActiveSupportAccessOrgIds(null, now)).toEqual([]);
    expect(getActiveSupportAccessOrgIds("garbage", now)).toEqual([]);
  });
});

describe("getSupportAccessMemberships", () => {
  const active = {
    role: "VIEWER",
    expiresAt: "2099-01-01T00:00:00.000Z",
    c1TaskId: "t",
  };

  beforeEach(() => vi.clearAllMocks());

  it("adds VIEWER only for orgs the user is not a member of", async () => {
    db.organization.findMany.mockResolvedValue([{ id: "org-2", projects: [] }]);
    const memberships = await getSupportAccessMemberships({
      supportAccess: { "org-1": active, "org-2": active },
      organizationMemberships: [{ organization: { id: "org-1" } }],
    });
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["org-2"] } } }),
    );
    expect(memberships).toEqual([
      {
        organization: { id: "org-2", projects: [] },
        role: "VIEWER",
        ProjectMemberships: [],
      },
    ]);
  });

  it("does not query when there is no active grant", async () => {
    expect(
      await getSupportAccessMemberships({
        supportAccess: null,
        organizationMemberships: [],
      }),
    ).toEqual([]);
    expect(db.organization.findMany).not.toHaveBeenCalled();
  });
});
