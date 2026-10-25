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
}));

vi.mock("@langfuse/shared/src/db", () => ({ prisma: db }));

import { verifyConductorOneRequest } from "@/src/ee/features/support-access/server/conductorOneAuth";
import {
  parseProvisionPayload,
  type SupportAccessRequest,
} from "@/src/ee/features/support-access/server/conductorOnePayload";
import { provisionSupportAccess } from "@/src/ee/features/support-access/server/provisionSupportAccess";
import { hasActiveSupportAccess } from "@/src/ee/features/support-access/server/supportAccess";

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

  it("accepts a valid token for this body", async () => {
    await expect(verify(`bearer ${await sign()}`)).resolves.toBeUndefined();
  });

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
  const c1User = {
    "@type": "type.googleapis.com/c1.api.user.v1.User",
    id: "c1-user",
    email: "Eng@ClickHouse.com",
  };
  const payload = (type: object) => ({
    taskView: { task: { id: "task-1", userId: "c1-user", type } },
    expanded: [
      { ...c1User, id: "someone-else", email: "other@clickhouse.com" },
      c1User,
    ],
  });

  it("reads a grant", () => {
    const grant = { appEntitlementId: "ent-1", grantDuration: "43200s" };
    expect(parseProvisionPayload(payload({ grant }))).toEqual({
      action: "grant",
      taskId: "task-1",
      entitlementId: "ent-1",
      email: "eng@clickhouse.com",
      durationMs: 43_200_000,
    });
  });

  it("reads a grant when C1 leaves empty objects in expanded", () => {
    const grant = { appEntitlementId: "ent-1", grantDuration: "43200s" };
    const withEmpty = payload({ grant });
    withEmpty.expanded.push({} as never);
    expect(parseProvisionPayload(withEmpty)).toMatchObject({
      action: "grant",
    });
  });

  it("reads a revoke", () => {
    const revoke = {
      appEntitlementId: "ent-1",
      source: { expired: { expiredAt: "2026-10-24T04:00:01Z" } },
    };
    expect(parseProvisionPayload(payload({ revoke }))).toEqual({
      action: "revoke",
      taskId: "task-1",
      entitlementId: "ent-1",
      email: "eng@clickhouse.com",
      durationMs: null,
    });
  });

  it("treats a missing or non-protobuf duration as none", () => {
    for (const grantDuration of [null, "12h", "-1s"]) {
      const grant = { appEntitlementId: "ent-1", grantDuration };
      expect(parseProvisionPayload(payload({ grant }))).toMatchObject({
        durationMs: null,
      });
    }
  });

  it.each([
    ["no task type", payload({})],
    [
      "both grant and revoke",
      payload({
        grant: { appEntitlementId: "e" },
        revoke: { appEntitlementId: "e" },
      }),
    ],
    ["something that isn't a task", { hello: "world" }],
  ])("returns null for %s", (_, value) => {
    expect(parseProvisionPayload(value)).toBeNull();
  });
});

describe("provisionSupportAccess", () => {
  const entitlementId = "ent-1";
  const now = new Date("2026-10-23T12:00:00.000Z");
  const grantRequest: SupportAccessRequest = {
    action: "grant",
    taskId: "task-1",
    entitlementId: "ent-1",
    email: "eng@clickhouse.com",
    durationMs: 12 * 3_600_000,
  };
  const revokeRequest: SupportAccessRequest = {
    action: "revoke",
    taskId: "task-2",
    entitlementId: "ent-1",
    email: "eng@clickhouse.com",
    durationMs: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ id: "user-1" });
  });

  it("grants VIEWER until now + duration", async () => {
    expect(
      await provisionSupportAccess(grantRequest, entitlementId, now),
    ).toEqual({
      ok: true,
      message: "VIEWER access granted until 2026-10-24T00:00:00.000Z",
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { supportAccessExpiresAt: new Date("2026-10-24T00:00:00.000Z") },
    });
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
    ).toMatchObject({ ok: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("rejects when there is no Langfuse user", async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(
      await provisionSupportAccess(grantRequest, entitlementId, now),
    ).toMatchObject({ ok: false });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("revokes support access", async () => {
    expect(
      await provisionSupportAccess(revokeRequest, entitlementId),
    ).toMatchObject({ ok: true });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { supportAccessExpiresAt: null },
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

describe("hasActiveSupportAccess", () => {
  const now = new Date("2026-10-23T12:00:00.000Z");
  const access = (supportAccessExpiresAt: Date | null) => ({
    supportAccessExpiresAt,
  });

  it("is active only before expiry", () => {
    expect(
      hasActiveSupportAccess(access(new Date("2026-10-23T13:00:00Z")), now),
    ).toBe(true);
    expect(
      hasActiveSupportAccess(access(new Date("2026-10-23T11:59:59Z")), now),
    ).toBe(false);
  });

  it("is inactive when never granted or revoked", () => {
    expect(hasActiveSupportAccess(access(null), now)).toBe(false);
  });
});
