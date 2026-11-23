import { randomUUID } from "crypto";
import { afterAll, describe, expect, it } from "vitest";

import { prisma, Role } from "@langfuse/shared/src/db";
import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { createSession } from "@/src/__tests__/fixtures/session-factory";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

const accessTestOrgIds: string[] = [];

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

describe("organizations.projectsPendingDeletion access", () => {
  afterAll(async () => {
    await prisma.organization.deleteMany({
      where: { id: { in: accessTestOrgIds } },
    });
  });

  it("rejects callers from another organization and scopes the read to the caller's organization", async () => {
    const own = await prepareOrganization({ hasSoftDeletedProject: false });
    const other = await prepareOrganization({ hasSoftDeletedProject: true });

    await expect(
      own.callerWithRole(Role.OWNER).organizations.projectsPendingDeletion({
        orgId: other.orgId,
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "User is not a member of this organization",
    });

    await expect(
      own.callerWithRole(Role.OWNER).organizations.projectsPendingDeletion({
        orgId: own.orgId,
      }),
    ).resolves.toBe(false);
  });

  // ADMIN is the broadest role without organization:delete; lower roles hold a subset of its scopes.
  it("denies deletion-status reads to an organization admin without organization:delete", async () => {
    const { orgId, callerWithRole } = await prepareOrganization({
      hasSoftDeletedProject: true,
    });

    await expect(
      callerWithRole(Role.ADMIN).organizations.projectsPendingDeletion({
        orgId,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Forbidden, user does not have access to this resource or action",
    });
  });
});

async function prepareOrganization({
  hasSoftDeletedProject,
}: {
  hasSoftDeletedProject: boolean;
}) {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const organization = await prisma.organization.create({
    data: {
      id: orgId,
      name: `Organization Delete Access Test ${id}`,
      ...(hasSoftDeletedProject
        ? {
            projects: {
              create: {
                id: `project-${id}`,
                name: "Purging project",
                deletedAt: new Date(),
              },
            },
          }
        : {}),
    },
  });
  accessTestOrgIds.push(organization.id);

  const callerWithRole = (role: Role) => {
    const session = createSession({
      user: { featureFlags: testFeatureFlags({ templateFlag: false }) },
      organizations: [
        {
          id: organization.id,
          name: organization.name,
          role,
          plan: "self-hosted:enterprise",
          aiTelemetryEnabled: true,
        },
      ],
      environment: {
        selfHostedInstancePlan: "self-hosted:enterprise",
      },
    });
    const ctx = createInnerTRPCContext({ session, headers: {} });
    return appRouter.createCaller({ ...ctx, prisma });
  };

  return { orgId: organization.id, callerWithRole };
}
