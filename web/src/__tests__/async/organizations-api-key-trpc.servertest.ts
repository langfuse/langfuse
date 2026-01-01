/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

describe("organization API keys trpc", () => {
  const organizationId = "seed-org-id";

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
          projects: [],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
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
          projects: [],
        },
      ],
      featureFlags: {
        excludeClickhouseRead: false,
        templateFlag: true,
      },
      admin: false,
    },
    environment: {} as any,
  };

  const ownerCtx = createInnerTRPCContext({ session: ownerSession });
  const ownerCaller = appRouter.createCaller({ ...ownerCtx, prisma });

  const memberCtx = createInnerTRPCContext({ session: memberSession });
  const memberCaller = appRouter.createCaller({ ...memberCtx, prisma });

  const unAuthedCtx = createInnerTRPCContext({ session: null });
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

    it("regular member cannot fetch organization API keys", async () => {
      await expect(
        memberCaller.organizationApiKeys.byOrganizationId({
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

    it("regular member cannot create organization API keys", async () => {
      await expect(
        memberCaller.organizationApiKeys.create({
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
  });
});
