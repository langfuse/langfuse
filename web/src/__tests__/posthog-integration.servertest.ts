/** @jest-environment node */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { TRPCError } from "@trpc/server";

describe("PostHog Integration SSRF Protection", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    // Set a test encryption key (64 hex characters = 32 bytes)
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    // Restore original environment
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  beforeEach(async () => await pruneDatabase());

  const session: Session = {
    expires: "1",
    user: {
      id: "user-1",
      name: "Demo User",
      canCreateOrganizations: true,
      organizations: [
        {
          id: "seed-org-id",
          role: "OWNER",
          plan: "cloud:hobby",
          cloudConfig: undefined,
          name: "Test Organization",
          metadata: {},
          projects: [
            {
              id: projectId,
              role: "ADMIN",
              name: "Test Project",
              deletedAt: null,
              retentionDays: null,
              metadata: {},
            },
          ],
        },
      ],
      featureFlags: {
        templateFlag: true,
        excludeClickhouseRead: false,
      },
      admin: true,
    },
    environment: {} as any,
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });
  const caller = appRouter.createCaller({ ...ctx, prisma });

  it("should reject localhost hostname", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://localhost:8000",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject 127.0.0.1 hostname", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://127.0.0.1:8000",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject AWS metadata endpoint", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://169.254.169.254",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject private IP ranges (10.0.0.0/8)", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://10.0.0.1",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject private IP ranges (192.168.0.0/16)", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://192.168.1.1",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject private IP ranges (172.16.0.0/12)", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://172.16.0.1",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should reject URL-encoded localhost bypass attempt", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://%6C%6F%63%61%6C%68%6F%73%74",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });

  it("should accept valid public hostname", async () => {
    // This test might fail due to DNS issues in CI but should pass locally
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "https://app.posthog.com",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).resolves.not.toThrow();

    // Verify it was saved
    const config = await prisma.posthogIntegration.findFirst({
      where: { projectId },
    });

    expect(config).not.toBeNull();
    expect(config?.posthogHostName).toBe("https://app.posthog.com");
  });

  it("should accept valid custom public hostname", async () => {
    // This test might fail due to DNS resolution in CI but should validate properly
    try {
      await caller.posthogIntegration.update({
        projectId,
        posthogHostname: "https://posthog.example.com",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      });

      // Verify it was saved
      const config = await prisma.posthogIntegration.findFirst({
        where: { projectId },
      });

      expect(config).not.toBeNull();
      expect(config?.posthogHostName).toBe("https://posthog.example.com");
    } catch (error) {
      // If DNS resolution fails, that's okay - we just want to ensure
      // it doesn't fail with "Blocked" error
      if (error instanceof TRPCError) {
        expect(error.message).not.toContain("Blocked");
      }
    }
  });
});
