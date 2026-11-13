import { testFeatureFlags } from "@/src/__tests__/fixtures/feature-flags";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";
import { Role } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { v4 as uuidv4 } from "uuid";
import { describe, expect, it } from "vitest";

async function createOwnerCaller() {
  const orgId = uuidv4();
  const userId = uuidv4();
  await prisma.organization.create({
    data: { id: orgId, name: `Default scores ${orgId.slice(0, 8)}` },
  });
  await prisma.user.create({
    data: {
      id: userId,
      email: `default-scores-${userId.slice(0, 8)}@test.com`,
      name: "Test User",
    },
  });
  await prisma.organizationMembership.create({
    data: { userId, orgId, role: Role.OWNER },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: userId,
      canCreateOrganizations: true,
      name: "Test User",
      email: "default-scores@test.com",
      organizations: [
        {
          id: orgId,
          name: "Test Organization",
          role: Role.OWNER,
          plan: "cloud:hobby",
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: false,
          aiTelemetryEnabled: true,
          projects: [],
        },
      ],
      featureFlags: testFeatureFlags(),
    },
    environment: {} as Session["environment"],
  };

  return {
    orgId,
    caller: appRouter.createCaller({
      ...createInnerTRPCContext({ session, headers: {} }),
      prisma,
    }),
  };
}

describe("projectsRouter default score configs", () => {
  it("creates open coding and pass or fail when a project is created", async () => {
    const { orgId, caller } = await createOwnerCaller();

    const project = await caller.projects.create({
      name: "Annotated project",
      orgId,
    });

    const configs = await prisma.scoreConfig.findMany({
      where: { projectId: project.id },
      orderBy: { name: "asc" },
      select: {
        name: true,
        dataType: true,
        categories: true,
        isArchived: true,
        minValue: true,
        maxValue: true,
      },
    });

    expect(configs).toEqual([
      {
        name: "open coding",
        dataType: "TEXT",
        categories: null,
        isArchived: false,
        minValue: null,
        maxValue: null,
      },
      {
        name: "pass or fail",
        dataType: "CATEGORICAL",
        categories: [
          { label: "Pass", value: 1 },
          { label: "Fail", value: 0 },
        ],
        isArchived: false,
        minValue: null,
        maxValue: null,
      },
    ]);
  });
});
