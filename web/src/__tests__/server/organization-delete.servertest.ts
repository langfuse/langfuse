import { randomUUID } from "crypto";
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@langfuse/shared/src/db";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("organizations.delete while projects are still purging", () => {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const projectId = `project-${id}`;
  const userId = `user-${id}`;

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it("rejects with PRECONDITION_FAILED when only soft-deleted projects remain", async () => {
    const organization = await prisma.organization.create({
      data: {
        id: orgId,
        name: `Organization Delete Test ${id}`,
        projects: {
          create: {
            id: projectId,
            name: "Purging project",
            deletedAt: new Date(),
          },
        },
      },
    });
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.com`,
        name: "Organization Delete Test User",
      },
    });
    const session = createSession({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        featureFlags: testFeatureFlags({ templateFlag: false }),
      },
      organizations: [
        {
          id: organization.id,
          name: organization.name,
          role: "OWNER",
          plan: "self-hosted:enterprise",
          aiTelemetryEnabled: true,
          // The session omits soft-deleted projects, matching auth.ts.
          projects: [],
        },
      ],
      environment: { selfHostedInstancePlan: "self-hosted:enterprise" },
    });
    const ctx = createInnerTRPCContext({ session, headers: {} });
    const caller = appRouter.createCaller({ ...ctx, prisma });

    await expect(
      caller.organizations.projectsPendingDeletion({ orgId }),
    ).resolves.toBe(true);
    await expect(caller.organizations.delete({ orgId })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    await expect(
      prisma.organization.findUnique({ where: { id: orgId } }),
    ).resolves.not.toBeNull();
  });
});
