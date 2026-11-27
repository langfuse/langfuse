import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { ForbiddenError } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import { createOrgMembership } from "@langfuse/shared/memberships";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import { deleteApiKeys } from "@langfuse/shared/src/server/auth/apiKeys";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
import { OrganizationId, SystemRoleId, UserId } from "@langfuse/shared/rbac";
import { createSession } from "@/src/__tests__/fixtures/session-factory";

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
  const session = createSession({
    user: {
      id: user.id,
      name: user.name,
      featureFlags: testFeatureFlags({ templateFlag: false }),
    },
    organizations: [
      {
        id: org.id,
        role,
        name: org.name,
        plan: "oss",
        aiTelemetryEnabled: true,
      },
    ],
  });
  return { ...session, orgId: org.id };
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
    it("issues a USER-scoped key bound to a creator who can invoke the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await createOrgMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        role: Role.MEMBER,
      });

      const key = await new GatewayApiKeyService(prisma).create({
        organizationId: org.id,
        name: "Test key",
        metadata: {},
        issuedAs: "user",
        session: orgSession(user, org, Role.MEMBER),
      });

      expect(await boundUserOf(key.id)).toBe(user.id);
      expect(
        await prisma.apiKey.findUniqueOrThrow({
          where: { id: key.id },
          select: { scope: true },
        }),
      ).toEqual({ scope: "USER" });
    });

    it("leaves a service-account key unbound so it outlives the creator", async () => {
      const org = await createOrg();
      const user = await createUser();
      await createOrgMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        role: Role.ADMIN,
      });

      const key = await new GatewayApiKeyService(prisma).create({
        organizationId: org.id,
        name: "Test key",
        metadata: {},
        issuedAs: "serviceAccount",
        session: orgSession(user, org, Role.ADMIN),
      });
      await deleteApiKeys(prisma, {
        orgId: org.id,
        userId: user.id,
      });

      expect(await boundUserOf(key.id)).toBeNull();
      expect(
        await prisma.apiKey.findUniqueOrThrow({
          where: { id: key.id },
          select: { createdByUserId: true },
        }),
      ).toEqual({ createdByUserId: user.id });
    });

    it("rejects a service-account key from a creator whose role cannot manage the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await createOrgMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        role: Role.MEMBER,
      });
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "serviceAccount",
          session: orgSession(user, org, Role.MEMBER),
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });

    it("rejects a creator whose role cannot invoke the gateway", async () => {
      const org = await createOrg();
      const user = await createUser();
      await createOrgMembership(prisma, {
        orgId: org.id,
        userId: user.id,
        role: Role.VIEWER,
      });
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "user",
          session: orgSession(user, org, Role.VIEWER),
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });

    it("rejects a creator who is not a member", async () => {
      const org = await createOrg();
      const user = await createUser();
      const before = await existingKeyIds();

      await expect(
        new GatewayApiKeyService(prisma).create({
          organizationId: org.id,
          name: "Test key",
          metadata: {},
          issuedAs: "user",
          session: {
            ...createSession({
              user: {
                id: user.id,
                name: user.name,
                featureFlags: testFeatureFlags({ templateFlag: false }),
              },
            }),
            orgId: org.id,
          },
        }),
      ).rejects.toThrow(ForbiddenError);
      expect(await existingKeyIds()).toEqual(before);
    });
  });

  describe("deleteApiKeys with a user scope", () => {
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

      const deleted = await deleteApiKeys(prisma, {
        orgId: org.id,
        userId: user.id,
      });

      expect(deleted.map((key) => key.id)).toEqual([revoked.id]);
      expect(await existingKeyIds()).toEqual(
        new Set([otherOrgKey.id, otherUserKey.id, unboundKey.id]),
      );
    });

    it("revokes the user's bound keys in every organization without a tenant", async () => {
      const [org, otherOrg] = await Promise.all([createOrg(), createOrg()]);
      const [user, otherUser] = await Promise.all([createUser(), createUser()]);
      const first = await createGatewayKey(org.id, user.id);
      const second = await createGatewayKey(otherOrg.id, user.id);
      const otherUserKey = await createGatewayKey(org.id, otherUser.id);

      const deleted = await deleteApiKeys(prisma, { userId: user.id });

      expect(new Set(deleted.map((key) => key.id))).toEqual(
        new Set([first.id, second.id]),
      );
      expect(await existingKeyIds()).toEqual(new Set([otherUserKey.id]));
    });
  });
});
