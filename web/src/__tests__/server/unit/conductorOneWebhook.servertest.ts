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

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: db,
  Prisma: { DbNull: "DbNull" },
  Role: { VIEWER: "VIEWER" },
}));

import { verifyConductorOneRequest } from "@/src/ee/features/support-access/server/conductorOneAuth";
import {
  C1_PROVISION_EVENT,
  parseConductorOneEnvelope,
  parseProvisionPayload as toRequest,
  type GrantRequest,
  type RevokeRequest,
} from "@/src/ee/features/support-access/server/conductorOnePayload";
import { provisionSupportAccess } from "@/src/ee/features/support-access/server/provisionSupportAccess";
import {
  getActiveSupportAccessGrants,
  getSupportAccessMemberships,
  parseSupportAccess,
} from "@/src/ee/features/support-access/server/supportAccess";

describe("verifyConductorOneRequest", () => {
  const issuer = "clickhouse.conductor.one";
  const audience = "us.cloud.langfuse.com";
  const body = Buffer.from('{"event":"x"}');
  const bodyHash = createHash("sha256").update(body).digest("base64");
  let key: CryptoKey;
  let unknownKey: CryptoKey;
  let jwks: ReturnType<typeof createLocalJWKSet>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    key = pair.privateKey;
    unknownKey = (await generateKeyPair("RS256")).privateKey;
    const jwk = {
      ...(await exportJWK(pair.publicKey)),
      kid: "k",
      alg: "RS256",
    };
    jwks = createLocalJWKSet({ keys: [jwk] });
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

  const verify = (authorization: string | null, rawBody = body) =>
    verifyConductorOneRequest({
      authorization,
      rawBody,
      issuer,
      audience,
      jwks,
    });

  it.each(["bearer", "Bearer"])(
    "accepts a valid token for this body (%s)",
    async (scheme) => {
      await expect(
        verify(`${scheme} ${await sign()}`),
      ).resolves.toBeUndefined();
    },
  );

  it.each([
    ["another issuer", { iss: "evil.conductor.one" }],
    ["another region's host", { aud: "cloud.langfuse.com" }],
    ["another body's hash", { htb_s256: "AAAA" }],
    ["no body hash", { htb_s256: undefined }],
  ])("rejects %s", async (_, claims) => {
    await expect(verify(`bearer ${await sign(claims)}`)).rejects.toThrow();
  });

  it("rejects a token moved onto a different body", async () => {
    const token = await sign();
    await expect(
      verify(`bearer ${token}`, Buffer.from('{"event":"y"}')),
    ).rejects.toThrow();
  });

  it("rejects an unknown key, an expired token and alg none", async () => {
    const forged = await sign({}, { key: unknownKey });
    const expired = await sign({}, { expiresIn: "-1m" });
    const part = (v: object) =>
      Buffer.from(JSON.stringify(v)).toString("base64url");
    const unsigned = `${part({ alg: "none" })}.${part({ iss: issuer, aud: audience, htb_s256: bodyHash })}.`;
    for (const token of [forged, expired, unsigned]) {
      await expect(verify(`bearer ${token}`)).rejects.toThrow();
    }
  });

  it("rejects missing authorization", async () => {
    for (const authorization of [null, "", "Basic abc"]) {
      await expect(verify(authorization)).rejects.toThrow();
    }
  });
});

describe("parseProvisionPayload", () => {
  const parseProvisionPayload = (payload: unknown) => {
    const body = JSON.stringify({ event: C1_PROVISION_EVENT, payload });
    const envelope = parseConductorOneEnvelope(Buffer.from(body));
    return envelope?.event === C1_PROVISION_EVENT
      ? toRequest(envelope.payload)
      : null;
  };
  const c1User = {
    "@type": "type.googleapis.com/c1.api.user.v1.User",
    id: "c1-user",
    email: "Eng@ClickHouse.com",
  };
  const payload = (type: object, extra: object = {}) => ({
    taskView: { task: { id: "task-1", userId: "c1-user", type, ...extra } },
    expanded: [
      { ...c1User, id: "someone-else", email: "other@clickhouse.com" },
      c1User,
    ],
  });
  // C1 puts submitted values in `task.data`; `task.form` only holds field definitions.
  const form = {
    form: { fields: [{ name: "langfuse_organization_id_0" }] },
    data: { langfuse_organization_id_0: "org-1" },
  };

  it("reads a grant", () => {
    const grant = { appEntitlementId: "ent-1", grantDuration: "43200s" };
    expect(parseProvisionPayload(payload({ grant }, form))).toEqual({
      action: "grant",
      taskId: "task-1",
      entitlementId: "ent-1",
      email: "eng@clickhouse.com",
      orgId: "org-1",
      durationMs: 43_200_000,
    });
  });

  it("reads a grant when C1 leaves empty objects in expanded", () => {
    const grant = { appEntitlementId: "ent-1", grantDuration: "43200s" };
    const withEmpty = payload({ grant }, form);
    withEmpty.expanded.push({} as never);
    expect(parseProvisionPayload(withEmpty)).toMatchObject({
      action: "grant",
      orgId: "org-1",
    });
  });

  it("reads a revoke", () => {
    const revoke = { appEntitlementId: "ent-1" };
    const extra = { data: { Justification_0: "done" } };
    expect(parseProvisionPayload(payload({ revoke }, extra))).toEqual({
      action: "revoke",
      taskId: "task-1",
      entitlementId: "ent-1",
      email: "eng@clickhouse.com",
    });
  });

  it("treats a missing or non-protobuf duration as none", () => {
    for (const grantDuration of [null, "12h", "-1s"]) {
      const grant = { appEntitlementId: "ent-1", grantDuration };
      expect(parseProvisionPayload(payload({ grant }, form))).toMatchObject({
        durationMs: null,
      });
    }
  });

  it.each([
    [
      "a grant without form values",
      payload({ grant: { appEntitlementId: "e" } }),
    ],
    [
      "form values nested under task.form",
      payload(
        { grant: { appEntitlementId: "e" } },
        { form: { data: { langfuse_organization_id_0: "org-1" } } },
      ),
    ],
    ["no task type", payload({})],
    ["something that isn't a task", { hello: "world" }],
  ])("returns null for %s", (_, value) => {
    expect(parseProvisionPayload(value)).toBeNull();
  });
});

describe("provisionSupportAccess", () => {
  const entitlementId = "ent-1";
  const now = new Date("2026-10-23T12:00:00.000Z");
  const user = { id: "user-1", supportAccess: null };
  const grantRequest: GrantRequest = {
    action: "grant",
    taskId: "task-1",
    entitlementId: "ent-1",
    email: "eng@clickhouse.com",
    orgId: "org-1",
    durationMs: 12 * 3_600_000,
  };
  const revokeRequest: RevokeRequest = {
    action: "revoke",
    taskId: "task-2",
    entitlementId: "ent-1",
    email: "eng@clickhouse.com",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue(user);
    db.organization.findUnique.mockResolvedValue({ id: "org-1" });
  });

  it("grants VIEWER until now + duration", async () => {
    expect(
      await provisionSupportAccess(grantRequest, entitlementId, now),
    ).toEqual({
      ok: true,
      message: "VIEWER access granted until 2026-10-24T00:00:00.000Z",
    });
    expect(db.$executeRaw).toHaveBeenCalledOnce();
  });

  it.each([
    ["another entitlement", { entitlementId: "ent-admin" }],
    ["no duration (permanent)", { durationMs: null }],
    ["a duration above 12h", { durationMs: 24 * 3_600_000 }],
    ["a non-ClickHouse email", { email: "eng@evil-clickhouse.com" }],
  ])("rejects %s", async (_, change) => {
    const request = { ...grantRequest, ...change };
    expect(
      await provisionSupportAccess(request, entitlementId, now),
    ).toMatchObject({
      ok: false,
    });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects when there is no Langfuse user", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(
      await provisionSupportAccess(grantRequest, entitlementId, now),
    ).toMatchObject({
      ok: false,
    });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects an unknown organization", async () => {
    db.organization.findUnique.mockResolvedValue(null);
    expect(
      await provisionSupportAccess(grantRequest, entitlementId, now),
    ).toMatchObject({
      ok: false,
    });
  });

  it("revokes all support access", async () => {
    expect(
      await provisionSupportAccess(revokeRequest, entitlementId),
    ).toMatchObject({
      ok: true,
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { supportAccess: "DbNull" },
    });
  });

  it("ignores revokes for another entitlement", async () => {
    const request = { ...revokeRequest, entitlementId: "other" };
    expect(await provisionSupportAccess(request, entitlementId)).toMatchObject({
      ok: false,
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe("support access in the session", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  const entry = (expiresAt: string) => ({ role: "VIEWER" as const, expiresAt });
  const active = entry("2099-01-01T00:00:00.000Z");

  beforeEach(() => vi.clearAllMocks());

  it("returns only unexpired grants", () => {
    expect(
      getActiveSupportAccessGrants(
        {
          current: entry("2026-10-23T13:00:00.000Z"),
          expired: entry("2026-10-23T11:59:59.000Z"),
        },
        now,
      ),
    ).toEqual([{ orgId: "current", role: "VIEWER" }]);
  });

  it("parses malformed values or other roles to no grants", () => {
    expect(
      parseSupportAccess({
        org: { role: "OWNER", expiresAt: "2099-01-01T00:00:00.000Z" },
      }),
    ).toEqual({});
    expect(parseSupportAccess(null)).toEqual({});
    expect(parseSupportAccess("garbage")).toEqual({});
  });

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
        supportAccess: true,
      },
    ]);
  });

  it("gives no access to an org whose grant has expired", async () => {
    db.organization.findMany.mockResolvedValue([
      { id: "active", projects: [] },
    ]);
    const memberships = await getSupportAccessMemberships({
      supportAccess: {
        active,
        expired: entry(new Date(Date.now() - 1000).toISOString()),
      },
      organizationMemberships: [],
    });
    expect(db.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ["active"] } } }),
    );
    expect(memberships.map((m) => m.organization.id)).toEqual(["active"]);
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
