import type { Session } from "next-auth";
import { randomUUID } from "crypto";

import type { Plan } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { appRouter } from "@/src/server/api/root";
import { createInnerTRPCContext } from "@/src/server/api/trpc";

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
