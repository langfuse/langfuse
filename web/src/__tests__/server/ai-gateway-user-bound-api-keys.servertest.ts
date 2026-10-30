import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterEach, describe, expect, it } from "vitest";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { ForbiddenError } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createApiKeyCacheKey,
  createOrgProjectAndApiKey,
  redis,
} from "@langfuse/shared/src/server";
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import {
  deleteUserBoundApiKeys,
  evictRevokedApiKeys,
} from "@/src/features/ai-gateway/server/apiKey/userBoundApiKeys";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import {
  GATEWAY_RESOLVE_KEY_NON_EXISTENT,
  GatewayResolveCache,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";

const cleanupOrganizations: string[] = [];
const cleanupUsers: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({
    where: { orgId: { in: cleanupOrganizations } },
  });
  await prisma.organization.deleteMany({
    where: { id: { in: cleanupOrganizations.splice(0) } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: cleanupUsers.splice(0) } },
  });
});

async function createOrg() {
  const { org } = await createOrgProjectAndApiKey();
  cleanupOrganizations.push(org.id);
  return org;
}

async function createUser() {
  const user = await prisma.user.create({
    data: { email: `bound-key-${randomUUID()}@example.test` },
  });
  cleanupUsers.push(user.id);
  return user;
}

async function boundUserOf(apiKeyId: string) {
  const row = await prisma.apiKey.findUniqueOrThrow({
    where: { id: apiKeyId },
    select: { userId: true },
  });
  return row.userId;
}

async function fastHashOf(apiKeyId: string) {
  const row = await prisma.apiKey.findUniqueOrThrow({
    where: { id: apiKeyId },
    select: { fastHashedSecretKey: true },
  });
  return row.fastHashedSecretKey!;
}

async function createGatewayKey(orgId: string, userId: string) {
  return createApiKey(prisma, {
    tenant: OrganizationId(orgId),
    scope: UserId(userId),
    role: SystemRoleId("AI_GATEWAY"),
    createdBy: UserId(userId),
  });
}

function orgSession(
  user: { id: string; name: string | null },
  org: { id: string; name: string },
  role: Role,
): OrgAuthedContext["session"] {
  const session = {
    expires: "1",
    user: {
      id: user.id,
      name: user.name,
      canCreateOrganizations: true,
      featureFlags: testFeatureFlags({ templateFlag: false }),
      organizations: [
        {
          id: org.id,
          name: org.name,
          role,
          cloudConfig: undefined,
          plan: "oss",
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
    },
    environment: {} as Session["environment"],
  } satisfies Session;
  return { ...session, orgId: org.id, orgRole: role };
}

async function existingKeyIds() {
  const rows = await prisma.apiKey.findMany({
    where: { orgId: { in: cleanupOrganizations } },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}

describe("user-bound API keys", () => {
  describe("createApiKey binding", () => {
    it("binds a user-scoped key to its user", async () => {
      const org = await createOrg();
      const user = await createUser();

      const key = await createGatewayKey(org.id, user.id);

      expect(await boundUserOf(key.id)).toBe(user.id);
    });

    it("leaves organization-scoped keys unbound even when a user creates them", async () => {
      const org = await createOrg();
      const user = await createUser();

      const key = await createApiKey(prisma, {
        tenant: OrganizationId(org.id),
        scope: OrganizationId(org.id),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: UserId(user.id),
      });

      expect(await boundUserOf(key.id)).toBeNull();
    });
  });

  describe("GatewayApiKeyService.create", () => {
    it("binds the key to a creator who can invoke the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await prisma.organizationMembership.create({
        data: { orgId: org.id, userId: user.id, role: Role.MEMBER },
      });

      const key = await new GatewayApiKeyService(prisma).create({
        organizationId: org.id,
        name: "Test key",
        metadata: {},
        issuedAs: "user",
        session: orgSession(user, org, Role.MEMBER),
      });

      expect(await boundUserOf(key.id)).toBe(user.id);
    });

    it("leaves a service-account key unbound so it outlives the creator", async () => {
      const org = await createOrg();
      const user = await createUser();
      await prisma.organizationMembership.create({
        data: { orgId: org.id, userId: user.id, role: Role.ADMIN },
      });

      const key = await new GatewayApiKeyService(prisma).create({
        organizationId: org.id,
        name: "Test key",
        metadata: {},
        issuedAs: "serviceAccount",
        session: orgSession(user, org, Role.ADMIN),
      });
      await prisma.$transaction((tx) =>
        deleteUserBoundApiKeys(tx, { userId: user.id, orgId: org.id }),
      );

      expect(await boundUserOf(key.id)).toBeNull();
      expect(
        await prisma.apiKey.findUniqueOrThrow({
          where: { id: key.id },
          select: { createdByUserId: true },
        }),
      ).toEqual({ createdByUserId: user.id });
    });

    it("rejects a service-account key from a creator whose current role cannot manage the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await prisma.organizationMembership.create({
        data: { orgId: org.id, userId: user.id, role: Role.MEMBER },
      });
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "serviceAccount",
          session: orgSession(user, org, Role.ADMIN),
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });

    it("rejects a creator whose current role cannot invoke the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await prisma.organizationMembership.create({
        data: { orgId: org.id, userId: user.id, role: Role.VIEWER },
      });
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "user",
          session: orgSession(user, org, Role.OWNER),
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });

    it("rejects a creator who is no longer a member", async () => {
      const org = await createOrg();
      const user = await createUser();
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "user",
          session: orgSession(user, org, Role.OWNER),
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });
  });

  describe("deleteUserBoundApiKeys", () => {
    it("revokes only the user's bound keys in the given organization", async () => {
      const [org, otherOrg] = await Promise.all([createOrg(), createOrg()]);
      const [user, otherUser] = await Promise.all([createUser(), createUser()]);
      const revoked = await createGatewayKey(org.id, user.id);
      const otherOrgKey = await createGatewayKey(otherOrg.id, user.id);
      const otherUserKey = await createGatewayKey(org.id, otherUser.id);
      const unboundKey = await createApiKey(prisma, {
        tenant: OrganizationId(org.id),
        scope: OrganizationId(org.id),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: "system",
      });

      const deleted = await prisma.$transaction((tx) =>
        deleteUserBoundApiKeys(tx, { userId: user.id, orgId: org.id }),
      );

      expect(deleted.map((key) => key.id)).toEqual([revoked.id]);
      expect(await existingKeyIds()).toEqual(
        new Set([otherOrgKey.id, otherUserKey.id, unboundKey.id]),
      );
    });

    it("revokes the user's bound keys in every organization without an orgId", async () => {
      const [org, otherOrg] = await Promise.all([createOrg(), createOrg()]);
      const [user, otherUser] = await Promise.all([createUser(), createUser()]);
      const first = await createGatewayKey(org.id, user.id);
      const second = await createGatewayKey(otherOrg.id, user.id);
      const otherUserKey = await createGatewayKey(org.id, otherUser.id);

      const deleted = await prisma.$transaction((tx) =>
        deleteUserBoundApiKeys(tx, { userId: user.id }),
      );

      expect(new Set(deleted.map((key) => key.id))).toEqual(
        new Set([first.id, second.id]),
      );
      expect(await existingKeyIds()).toEqual(new Set([otherUserKey.id]));
    });
  });

  describe("evictRevokedApiKeys", () => {
    it("clears the auth and gateway resolve caches of revoked keys", async () => {
      const org = await createOrg();
      const user = await createUser();
      const key = await createGatewayKey(org.id, user.id);
      const hash = await fastHashOf(key.id);
      const resolveCache = new GatewayResolveCache();
      await redis!.set(createApiKeyCacheKey(hash), "cached");
      await resolveCache.set({
        fastHashedSecretKey: hash,
        apiFormat: "openai.responses",
        context: GATEWAY_RESOLVE_KEY_NON_EXISTENT,
      });

      const deleted = await prisma.$transaction((tx) =>
        deleteUserBoundApiKeys(tx, { userId: user.id, orgId: org.id }),
      );
      await evictRevokedApiKeys(deleted, { userId: user.id });

      expect(await redis!.exists(createApiKeyCacheKey(hash))).toBe(0);
      expect(
        await resolveCache.get({
          fastHashedSecretKey: hash,
          apiFormat: "openai.responses",
        }),
      ).toBeNull();
    });

    it("writes one delete audit entry per key with the unbinding reason", async () => {
      const org = await createOrg();
      const [user, admin] = await Promise.all([createUser(), createUser()]);
      const first = await createGatewayKey(org.id, user.id);
      const second = await createGatewayKey(org.id, user.id);
      await prisma.gatewayApiKeyAssociation.create({
        data: { apiKeyId: first.id, metadata: { team: "search" } },
      });

      const deleted = await prisma.$transaction((tx) =>
        deleteUserBoundApiKeys(tx, { userId: user.id, orgId: org.id }),
      );
      await evictRevokedApiKeys(deleted, { userId: admin.id });

      const entries = await prisma.auditLog.findMany({
        where: { resourceId: { in: [first.id, second.id] } },
      });
      expect(entries).toHaveLength(2);
      const firstEntry = entries.find((entry) => entry.resourceId === first.id);
      expect(firstEntry).toMatchObject({
        resourceType: "apiKey",
        action: "delete",
        userId: admin.id,
        orgId: org.id,
      });
      expect(JSON.parse(firstEntry!.before!)).toMatchObject({
        metadata: { team: "search" },
        apiKey: {
          id: first.id,
          publicKey: first.publicKey,
          displaySecretKey: first.displaySecretKey,
          createdByUserId: user.id,
        },
      });
      expect(JSON.parse(firstEntry!.after!)).toEqual({
        reason: "user_unbound",
        userId: user.id,
      });
    });
  });
});
