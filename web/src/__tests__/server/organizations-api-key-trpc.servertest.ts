import type { Session } from "next-auth";

// Session fixture sub-object types; casts keep the runtime fixtures unchanged
// while satisfying newer required fields on the session user type.
type SessionUser = NonNullable<Session["user"]>;
type SessionOrg = SessionUser["organizations"][number];
type SessionFeatureFlags = SessionUser["featureFlags"];
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { createAndAddApiKeysToDb } from "@langfuse/shared/src/server";

describe("organization API keys trpc", () => {
  const organizationId = "seed-org-id";

  // The session user is persisted as the API key creator, so it must exist
  // in the database (CI does not run the seeder that creates user-1).
  // createMany + skipDuplicates is atomic, so concurrently running test
  // files can ensure the user without racing each other.
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: "user-1",
          name: "Demo User",
          email: "demo-user-1@langfuse.com",
        },
      ],
      skipDuplicates: true,
    });
  });

  const ownerSession: Session = {
    expires: "1",
    user: {
      id: "user-1",
      canCreateOrganizations: true,
      name: "Demo User",
      organizations: [
        {
          id: organizationId,
          name: "Test Organization",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [] as SessionOrg["projects"],
        } as SessionOrg,
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      } as SessionFeatureFlags,
      admin: true,
    },
    environment: {} as any,
  };

  const memberSession: Session = {
    expires: "1",
    user: {
      id: "user-2",
      canCreateOrganizations: true,
      name: "Member User",
      organizations: [
        {
          id: organizationId,
          name: "Test Organization",
          role: "MEMBER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [] as SessionOrg["projects"],
        } as SessionOrg,
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      } as SessionFeatureFlags,
      admin: false,
    },
    environment: {} as any,
  };

  const adminSession: Session = {
    expires: "1",
    user: {
      id: "user-3",
      canCreateOrganizations: true,
      name: "Admin User",
      organizations: [
        {
          id: organizationId,
          name: "Test Organization",
          role: "ADMIN",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          projects: [] as SessionOrg["projects"],
        } as SessionOrg,
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      } as SessionFeatureFlags,
      admin: false,
    },
    environment: {} as any,
  };

  const ownerCtx = createInnerTRPCContext({
    session: ownerSession,
    headers: {},
  });
  const ownerCaller = appRouter.createCaller({ ...ownerCtx, prisma });

  const memberCtx = createInnerTRPCContext({
    session: memberSession,
    headers: {},
  });
  const memberCaller = appRouter.createCaller({ ...memberCtx, prisma });

  const adminCtx = createInnerTRPCContext({
    session: adminSession,
    headers: {},
  });
  const adminCaller = appRouter.createCaller({ ...adminCtx, prisma });

  const unAuthedCtx = createInnerTRPCContext({ session: null, headers: {} });
  const unAuthedCaller = appRouter.createCaller({ ...unAuthedCtx, prisma });

  describe("organizationApiKeys.byOrganizationId", () => {
    it("owner can fetch organization API keys", async () => {
      // Create a test API key first
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Test API Key",
      });

      expect(apiKeyResult).toBeDefined();
      expect(apiKeyResult.secretKey).toBeDefined();
      expect(apiKeyResult.publicKey).toBeDefined();

      // Now fetch the keys
      const apiKeys = await ownerCaller.organizationApiKeys.byOrganizationId({
        orgId: organizationId,
      });

      expect(apiKeys.length).toBeGreaterThanOrEqual(1);
      const newKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(newKey?.note).toBe("Test API Key");
      expect(newKey?.publicKey).toBe(apiKeyResult.publicKey);
      expect(newKey?.displaySecretKey).toBeDefined();
    });

    it("filters in-app agent API keys", async () => {
      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: organizationId,
        scope: "ORGANIZATION",
        note: "In-app agent key hidden from org UI",
        isInAppAgentKey: true,
      });

      const apiKeys = await ownerCaller.organizationApiKeys.byOrganizationId({
        orgId: organizationId,
      });

      expect(apiKeys.map((key) => key.id)).not.toContain(inAppAgentKey.id);
      expect(apiKeys.map((key) => key.note)).not.toContain(
        "In-app agent key hidden from org UI",
      );
    });

    it("regular member cannot fetch organization API keys", async () => {
      await expect(
        memberCaller.organizationApiKeys.byOrganizationId({
          orgId: organizationId,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("admin cannot fetch organization API keys", async () => {
      await expect(
        adminCaller.organizationApiKeys.byOrganizationId({
          orgId: organizationId,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("unauthenticated user cannot fetch organization API keys", async () => {
      await expect(
        unAuthedCaller.organizationApiKeys.byOrganizationId({
          orgId: organizationId,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("organizationApiKeys.create", () => {
    it("owner can create organization API keys", async () => {
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Test API Key",
      });

      expect(apiKeyResult).toBeDefined();
      expect(apiKeyResult.secretKey).toBeDefined();
      expect(apiKeyResult.publicKey).toBeDefined();
      expect(apiKeyResult.note).toBe("Test API Key");
    });

    it("stores the creating user and returns it in the list", async () => {
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Key for creator attribution test",
      });

      const dbKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: apiKeyResult.id },
      });
      expect(dbKey.createdByUserId).toBe("user-1");
      expect(dbKey.createdByApiKeyId).toBeNull();

      const apiKeys = await ownerCaller.organizationApiKeys.byOrganizationId({
        orgId: organizationId,
      });
      const listedKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(listedKey?.createdByUser?.id).toBe("user-1");
      expect(listedKey?.createdByApiKey).toBeNull();
    });

    it("regular member cannot create organization API keys", async () => {
      await expect(
        memberCaller.organizationApiKeys.create({
          orgId: organizationId,
          note: "Test API Key",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("admin cannot create organization API keys", async () => {
      await expect(
        adminCaller.organizationApiKeys.create({
          orgId: organizationId,
          note: "Test API Key",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("unauthenticated user cannot create organization API keys", async () => {
      await expect(
        unAuthedCaller.organizationApiKeys.create({
          orgId: organizationId,
          note: "Test API Key",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("organizationApiKeys.updateNote", () => {
    it("owner can update API key note", async () => {
      // Create a key first
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Original Note",
      });

      // Update the note
      await ownerCaller.organizationApiKeys.updateNote({
        orgId: organizationId,
        keyId: apiKeyResult.id,
        note: "Updated Note",
      });

      // Fetch to verify
      const apiKeys = await ownerCaller.organizationApiKeys.byOrganizationId({
        orgId: organizationId,
      });

      expect(apiKeys.length).toBeGreaterThanOrEqual(1);
      const updatedKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(updatedKey?.note).toBe("Updated Note");
    });

    it("does not update in-app agent API keys", async () => {
      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: organizationId,
        scope: "ORGANIZATION",
        note: "Original in-app agent note",
        isInAppAgentKey: true,
      });

      await expect(
        ownerCaller.organizationApiKeys.updateNote({
          orgId: organizationId,
          keyId: inAppAgentKey.id,
          note: "Updated in-app agent note",
        }),
      ).rejects.toThrow();

      const persistedKey = await prisma.apiKey.findUniqueOrThrow({
        where: { id: inAppAgentKey.id },
      });
      expect(persistedKey.note).toBe("Original in-app agent note");
    });

    it("regular member cannot update API key note", async () => {
      // Create a key as owner
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Original Note",
      });

      // Try to update as member
      await expect(
        memberCaller.organizationApiKeys.updateNote({
          orgId: organizationId,
          keyId: apiKeyResult.id,
          note: "Updated Note",
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("admin cannot update API key note", async () => {
      // Create a key as owner
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "Original Note",
      });

      // Try to update as admin
      await expect(
        adminCaller.organizationApiKeys.updateNote({
          orgId: organizationId,
          keyId: apiKeyResult.id,
          note: "Updated Note",
        }),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("organizationApiKeys.delete", () => {
    it("owner can delete API key", async () => {
      // Create a key first
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "To Be Deleted",
      });

      // Delete the key
      await ownerCaller.organizationApiKeys.delete({
        orgId: organizationId,
        id: apiKeyResult.id,
      });

      // Verify it's gone
      const apiKeys = await ownerCaller.organizationApiKeys.byOrganizationId({
        orgId: organizationId,
      });

      const deletedKey = apiKeys.find((key) => key.id === apiKeyResult.id);
      expect(deletedKey).toBeUndefined();
    });

    it("does not delete in-app agent API keys", async () => {
      const inAppAgentKey = await createAndAddApiKeysToDb({
        prisma,
        entityId: organizationId,
        scope: "ORGANIZATION",
        isInAppAgentKey: true,
      });

      await expect(
        ownerCaller.organizationApiKeys.delete({
          orgId: organizationId,
          id: inAppAgentKey.id,
        }),
      ).resolves.toBe(false);

      await expect(
        prisma.apiKey.findUniqueOrThrow({ where: { id: inAppAgentKey.id } }),
      ).resolves.toBeDefined();
    });

    it("regular member cannot delete API key", async () => {
      // Create a key as owner
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "To Be Deleted",
      });

      // Try to delete as member
      await expect(
        memberCaller.organizationApiKeys.delete({
          orgId: organizationId,
          id: apiKeyResult.id,
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("admin cannot delete API key", async () => {
      // Create a key as owner
      const apiKeyResult = await ownerCaller.organizationApiKeys.create({
        orgId: organizationId,
        note: "To Be Deleted",
      });

      // Try to delete as admin
      await expect(
        adminCaller.organizationApiKeys.delete({
          orgId: organizationId,
          id: apiKeyResult.id,
        }),
      ).rejects.toThrow(TRPCError);
    });
  });
});
