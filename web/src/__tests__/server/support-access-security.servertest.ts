import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
} from "jose";
import { type NextApiRequest, type NextApiResponse } from "next";
import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { createResponse } from "node-mocks-http";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { C1_PROVISION_EVENT } from "@/src/ee/features/support-access/server/conductorOnePayload";
import { conductorOneWebhookHandler } from "@/src/ee/features/support-access/server/conductorOneWebhook";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { getAuthOptions } from "@/src/server/auth";

// End-to-end security contracts for ConductorOne support access: only a
// correctly signed webhook can grant access, and a grant gives time-boxed,
// read-only access to exactly one organization.

const jwksHolder = vi.hoisted(() => ({
  jwks: undefined as unknown as ReturnType<typeof createLocalJWKSet>,
}));

vi.mock("@/src/env.mjs", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { ...actual, env: { ...actual.env } };
});

vi.mock(
  "@/src/ee/features/support-access/server/conductorOneAuth",
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    getConductorOneJwks: () => jwksHolder.jwks,
  }),
);

const issuer = "test.conductor.one";
const entitlementId = "ent-support-access";
const nextAuthUrl = "https://us.cloud.langfuse.com";
const audience = "us.cloud.langfuse.com";

let signingKey: CryptoKey;
let unknownKey: CryptoKey;

beforeAll(async () => {
  Object.assign(env, {
    LANGFUSE_CONDUCTORONE_ISSUER: issuer,
    LANGFUSE_CONDUCTORONE_ENTITLEMENT_ID: entitlementId,
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: "US",
    NEXTAUTH_URL: nextAuthUrl,
  });

  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  unknownKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k", alg: "RS256" };
  jwksHolder.jwks = createLocalJWKSet({ keys: [jwk] });
});

async function sign(
  body: Buffer,
  claims: JWTPayload = {},
  opts: { key?: CryptoKey; expiresIn?: string } = {},
) {
  const htb = createHash("sha256").update(body).digest("base64");
  const { iss = issuer, aud = audience, ...rest } = claims;
  return new SignJWT({ htb_s256: htb, ...rest })
    .setProtectedHeader({ alg: "RS256", kid: "k" })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "2m")
    .sign(opts.key ?? signingKey);
}

async function callWebhook(body: Buffer, authorization?: string) {
  const req = Object.assign(Readable.from([body]), {
    method: "POST",
    headers: {
      "content-length": String(body.length),
      ...(authorization ? { authorization } : {}),
    },
  }) as unknown as NextApiRequest;
  const res = createResponse<NextApiResponse>();
  await conductorOneWebhookHandler(req, res);
  return { status: res.statusCode, body: res._getJSONData() };
}

function provisionBody(params: { email: string; orgId: string; type: object }) {
  return Buffer.from(
    JSON.stringify({
      version: "v1",
      event: C1_PROVISION_EVENT,
      payload: {
        taskView: {
          task: {
            id: `task-${randomUUID()}`,
            userId: "c1-user",
            type: params.type,
            data: { langfuse_organization_id_0: params.orgId },
          },
        },
        expanded: [
          {
            "@type": "type.googleapis.com/c1.api.user.v1.User",
            id: "c1-user",
            email: params.email,
          },
        ],
      },
    }),
  );
}

const grantType = (grantDuration = "3600s") => ({
  grant: { appEntitlementId: entitlementId, grantDuration },
});
const revokeType = { revoke: { appEntitlementId: entitlementId } };

async function createFixture() {
  const email = `support-${randomUUID()}@clickhouse.com`;
  const user = await prisma.user.create({ data: { email, name: "Support" } });
  const org = await prisma.organization.create({
    data: {
      name: `Support Access Org ${randomUUID()}`,
      projects: { create: { name: "Customer Project" } },
    },
    include: { projects: true },
  });
  return { email, user, orgId: org.id, projectId: org.projects[0].id };
}

async function readSupportAccess(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { supportAccess: true },
  });
  return user.supportAccess;
}

async function sessionFor(email: string): Promise<Session> {
  const sessionCallback = (await getAuthOptions()).callbacks
    ?.session as (params: { session: Session; token: JWT }) => Promise<Session>;
  return sessionCallback({
    session: { expires: "1", user: null } as unknown as Session,
    token: { email, loginAt: Date.now() },
  });
}

async function callerFor(email: string) {
  const session = await sessionFor(email);
  const ctx = createInnerTRPCContext({ session, headers: {} });
  return { session, caller: appRouter.createCaller({ ...ctx, prisma }) };
}

describe("ConductorOne webhook authentication", () => {
  it.each([
    ["no authorization header", async () => undefined],
    ["a non-bearer scheme", async () => "Basic abc"],
    [
      "a token for another region's host",
      async (body: Buffer) =>
        `Bearer ${await sign(body, { aud: "eu.cloud.langfuse.com" })}`,
    ],
    [
      "a token from another issuer",
      async (body: Buffer) =>
        `Bearer ${await sign(body, { iss: "evil.conductor.one" })}`,
    ],
    [
      "a token signed by an unknown key",
      async (body: Buffer) =>
        `Bearer ${await sign(body, {}, { key: unknownKey })}`,
    ],
    [
      "an expired token",
      async (body: Buffer) =>
        `Bearer ${await sign(body, {}, { expiresIn: "-1m" })}`,
    ],
    [
      "a token signed for a different body",
      async () => `Bearer ${await sign(Buffer.from('{"event":"other"}'))}`,
    ],
  ])("rejects %s with 401 and grants nothing", async (_, authFor) => {
    const { email, user, orgId } = await createFixture();
    const body = provisionBody({ email, orgId, type: grantType() });

    const response = await callWebhook(body, await authFor(body));

    expect(response.status).toBe(401);
    expect(await readSupportAccess(user.id)).toBeNull();
  });

  it("accepts a correctly signed grant", async () => {
    const { email, user, orgId } = await createFixture();
    const body = provisionBody({ email, orgId, type: grantType() });

    const response = await callWebhook(body, `Bearer ${await sign(body)}`);

    expect(response).toMatchObject({
      status: 200,
      body: { version: "v1", complete: {} },
    });
    expect(await readSupportAccess(user.id)).toMatchObject({
      [orgId]: { role: "VIEWER" },
    });
  });

  it.each([
    ["the issuer", "LANGFUSE_CONDUCTORONE_ISSUER"],
    ["the entitlement", "LANGFUSE_CONDUCTORONE_ENTITLEMENT_ID"],
    ["the Cloud region", "NEXT_PUBLIC_LANGFUSE_CLOUD_REGION"],
  ] as const)("is disabled (404) without %s configured", async (_, key) => {
    const { email, user, orgId } = await createFixture();
    const body = provisionBody({ email, orgId, type: grantType() });
    const previous = env[key];
    Object.assign(env, { [key]: undefined });
    try {
      const response = await callWebhook(body, `Bearer ${await sign(body)}`);
      expect(response.status).toBe(404);
    } finally {
      Object.assign(env, { [key]: previous });
    }
    expect(await readSupportAccess(user.id)).toBeNull();
  });
});

describe("support access in the product", () => {
  async function grant(email: string, orgId: string, duration?: string) {
    const body = provisionBody({ email, orgId, type: grantType(duration) });
    const response = await callWebhook(body, `Bearer ${await sign(body)}`);
    expect(response.body).toMatchObject({ complete: {} });
  }

  it("gives read access to the granted organization's projects", async () => {
    const { email, orgId, projectId } = await createFixture();
    await grant(email, orgId);

    const { session, caller } = await callerFor(email);

    expect(session.user?.organizations).toContainEqual(
      expect.objectContaining({
        id: orgId,
        role: "VIEWER",
        supportAccess: true,
      }),
    );
    await expect(caller.scoreConfigs.all({ projectId })).resolves.toMatchObject(
      { totalCount: 0 },
    );
  });

  it("is read-only", async () => {
    const { email, orgId, projectId } = await createFixture();
    await grant(email, orgId);

    const { caller } = await callerFor(email);

    await expect(
      caller.scoreConfigs.create({
        projectId,
        name: "support-write",
        dataType: "BOOLEAN",
        categories: [
          { label: "True", value: 1 },
          { label: "False", value: 0 },
        ],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gives no access to other organizations", async () => {
    const { email, orgId } = await createFixture();
    const other = await createFixture();
    await grant(email, orgId);

    const { session, caller } = await callerFor(email);

    expect(session.user?.organizations.map((o) => o.id)).not.toContain(
      other.orgId,
    );
    await expect(
      caller.scoreConfigs.all({ projectId: other.projectId }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("gives no access once the grant has expired", async () => {
    const { email, user, orgId, projectId } = await createFixture();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        supportAccess: {
          [orgId]: {
            role: "VIEWER",
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      },
    });

    const { session, caller } = await callerFor(email);

    expect(session.user?.organizations.map((o) => o.id)).not.toContain(orgId);
    await expect(caller.scoreConfigs.all({ projectId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("gives no access after a revoke", async () => {
    const { email, orgId, projectId } = await createFixture();
    await grant(email, orgId);
    const body = provisionBody({ email, orgId, type: revokeType });
    await callWebhook(body, `Bearer ${await sign(body)}`);

    const { caller } = await callerFor(email);

    await expect(caller.scoreConfigs.all({ projectId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it.each([
    ["longer than 12h", "43201s"],
    ["without a duration", "permanent"],
  ])("refuses a grant %s", async (_, duration) => {
    const { email, user, orgId } = await createFixture();
    const body = provisionBody({ email, orgId, type: grantType(duration) });

    const response = await callWebhook(body, `Bearer ${await sign(body)}`);

    expect(response.body).toMatchObject({ errored: {} });
    expect(await readSupportAccess(user.id)).toBeNull();
  });
});
