import type { Session } from "next-auth";
import { randomUUID } from "crypto";

import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { env } from "@/src/env.mjs";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

describe("userAccountRouter.setFeaturePreviewEnabled", () => {
  const originalCloudRegion = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  beforeEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
  });

  afterEach(() => {
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = originalCloudRegion;
  });

  it("enables the search bar preview, leaving other flags intact", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "searchBar",
      enabled: true,
    });

    expect(result).toEqual({ success: true, flag: "searchBar", enabled: true });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag", "searchBar"]);
  });

  it("disables a preview flag without touching the others", async () => {
    const { caller, userId } = await createCaller({
      featureFlags: ["templateFlag", "searchBar"],
    });

    const result = await caller.userAccount.setFeaturePreviewEnabled({
      flag: "searchBar",
      enabled: false,
    });

    expect(result).toEqual({
      success: true,
      flag: "searchBar",
      enabled: false,
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { featureFlags: true },
    });
    expect(user.featureFlags).toEqual(["templateFlag"]);
  });

  it("rejects enabling in self-hosted deployments", async () => {
    const { caller } = await createCaller();
    (env as any).NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = undefined;

    await expect(
      caller.userAccount.setFeaturePreviewEnabled({
        flag: "searchBar",
        enabled: true,
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

async function createCaller({
  plan = "cloud:hobby",
  aiFeaturesEnabled = true,
  featureFlags = ["templateFlag"],
  includeProjectInSession = true,
}: {
  plan?: Plan;
  aiFeaturesEnabled?: boolean;
  featureFlags?: string[];
  includeProjectInSession?: boolean;
} = {}) {
  const id = randomUUID();
  const orgId = `org-${id}`;
  const projectId = `project-${id}`;
  const userId = `user-${id}`;

  const org = await prisma.organization.create({
    data: {
      id: orgId,
      name: `User Account Test Org ${id}`,
      aiFeaturesEnabled,
    },
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      orgId,
      name: `User Account Test Project ${id}`,
    },
  });
  const user = await prisma.user.create({
    data: {
      id: userId,
      email: `${userId}@example.com`,
      name: "User Account Test User",
      featureFlags,
    },
  });

  const session: Session = {
    expires: "1",
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      canCreateOrganizations: true,
      organizations: [
        {
          id: org.id,
          name: org.name,
          role: "OWNER",
          plan,
          cloudConfig: undefined,
          metadata: {},
          aiFeaturesEnabled: org.aiFeaturesEnabled,
          aiTelemetryEnabled: true,
          projects: includeProjectInSession
            ? [
                {
                  id: project.id,
                  name: project.name,
                  role: "ADMIN",
                  deletedAt: null,
                  retentionDays: null,
                  hasTraces: false,
                  metadata: {},
                  createdAt: project.createdAt.toISOString(),
                },
              ]
            : [],
        },
      ],
      featureFlags: {
        searchBar: featureFlags.includes("searchBar"),
        templateFlag: featureFlags.includes("templateFlag"),
        excludeClickhouseRead: false,
        observationEvals: false,
        v4BetaToggleVisible: false,
        experimentsV4Enabled: false,
      },
      admin: false,
    },
    environment: {
      enableExperimentalFeatures: false,
      selfHostedInstancePlan: "cloud:enterprise",
    },
  };

  const ctx = createInnerTRPCContext({ session, headers: {} });

  return {
    orgId,
    projectId,
    userId,
    caller: appRouter.createCaller({ ...ctx, prisma }),
  };
}
