import { randomUUID } from "node:crypto";
import type { Session } from "next-auth";
import { afterEach, describe, expect, it } from "vitest";

import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { ForbiddenError } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  createApiKey,
  createOrgProjectAndApiKey,
} from "@langfuse/shared/src/server";
import { GatewayApiKeyService } from "@/src/features/ai-gateway/server/apiKey/gatewayApiKeyService";
import { deleteApiKeys } from "@langfuse/shared/src/server/auth/apiKeys";
import type { OrgAuthedContext } from "@/src/server/api/trpc";
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
    it("issues a USER-scoped key bound to a creator who can invoke the gateway", async () => {
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
      await deleteApiKeys(prisma, {
        tenant: OrganizationId(org.id),
        scope: UserId(user.id),
      });

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
        tenant: OrganizationId(org.id),
        scope: UserId(user.id),
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

      const deleted = await deleteApiKeys(prisma, { scope: UserId(user.id) });

      expect(new Set(deleted.map((key) => key.id))).toEqual(
        new Set([first.id, second.id]),
      );
      expect(await existingKeyIds()).toEqual(new Set([otherUserKey.id]));
    });
  });
});
