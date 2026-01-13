/** @jest-environment node */

import type { Session } from "next-auth";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

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

  it("should reject private IPs and localhost in PostHog hostname", async () => {
    await expect(
      caller.posthogIntegration.update({
        projectId,
        posthogHostname: "http://localhost",
        posthogProjectApiKey: "phc_test_key_12345",
        enabled: true,
      }),
    ).rejects.toThrow(/Invalid PostHog hostname.*Blocked/);
  });
});
