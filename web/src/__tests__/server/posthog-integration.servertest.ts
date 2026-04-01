/** @jest-environment node */

import type { Session } from "next-auth";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { createOrgProjectAndApiKey } from "@langfuse/shared/src/server";

describe("PostHog Integration SSRF Protection", () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;
  let projectId: string;
  let orgId: string;
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeAll(() => {
    // Set a test encryption key (64 hex characters = 32 bytes)
    process.env.ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterAll(() => {
    // Restore original environment
    process.env.ENCRYPTION_KEY = originalEncryptionKey;
  });

  beforeEach(async () => {
    const setup = await createOrgProjectAndApiKey();
    projectId = setup.projectId;
    orgId = setup.orgId;

    const session: Session = {
      expires: "1",
      user: {
        id: "user-1",
        name: "Demo User",
        canCreateOrganizations: true,
        organizations: [
          {
            id: orgId,
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
    caller = appRouter.createCaller({ ...ctx, prisma });
  });

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
