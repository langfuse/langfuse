import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createApiKeyCacheKey,
  createOrgProjectAndApiKey,
  redis,
} from "@langfuse/shared/src/server";
import {
  deleteUserBoundApiKeys,
  evictRevokedApiKeys,
} from "@/src/features/ai-gateway/server/apiKey/userBoundApiKeys";
import {
  GATEWAY_RESOLVE_KEY_NON_EXISTENT,
  GatewayResolveCache,
} from "@/src/features/ai-gateway/server/resolve/gatewayResolveCache";
import {
  ApiKeyId,
  OrganizationId,
  SystemRoleId,
  UserId,
} from "@langfuse/shared/rbac";

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
    owner: OrganizationId(orgId),
    role: SystemRoleId("AI_GATEWAY"),
    createdBy: UserId(userId),
  });
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
    it("binds an AI_GATEWAY key to the user who created it", async () => {
      const org = await createOrg();
      const user = await createUser();

      const key = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: UserId(user.id),
      });

      expect(await boundUserOf(key.id)).toBe(user.id);
    });

    it("leaves AI_GATEWAY keys created by the system or by an API key unbound", async () => {
      const org = await createOrg();
      const user = await createUser();
      const creatorKey = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("ADMIN"),
        createdBy: UserId(user.id),
      });

      const bySystem = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: "system",
      });
      const byApiKey = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("AI_GATEWAY"),
        createdBy: ApiKeyId(creatorKey.id),
      });

      expect(await boundUserOf(bySystem.id)).toBeNull();
      expect(await boundUserOf(byApiKey.id)).toBeNull();
    });

    it("leaves user-created keys with other roles unbound", async () => {
      const org = await createOrg();
      const user = await createUser();

      const key = await createApiKey(prisma, {
        owner: OrganizationId(org.id),
        role: SystemRoleId("ADMIN"),
        createdBy: UserId(user.id),
      });

      expect(await boundUserOf(key.id)).toBeNull();
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
        owner: OrganizationId(org.id),
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
