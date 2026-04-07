import { type Session } from "next-auth";
import { CloudConfigSchema } from "@langfuse/shared";
import { prisma, Role } from "@langfuse/shared/src/db";
import {
  getOrganizationPlanServerSide,
  getSelfHostedInstancePlanServerSide,
} from "@/src/features/entitlements/server/getPlan";
import { parseFlags } from "@/src/features/feature-flags/utils";
import { createSupportEmailHash } from "@/src/features/support-chat/createSupportEmailHash";
import { isDevAuthBypassEnabled } from "@/src/features/auth/lib/devAuthBypass";
import { designModeOrganizations } from "@/src/features/design-mode/mockDb";

const DEV_BYPASS_FALLBACK_USER = {
  id: "dev-auth-bypass-user",
  name: "Evren",
  email: "evren@langfuse.local",
} as const;

export async function getDevBypassSession(): Promise<Session> {
  let dbUser: Awaited<ReturnType<typeof prisma.user.findFirst>> = null;
  let organizations: Awaited<ReturnType<typeof prisma.organization.findMany>> =
    [];

  try {
    [dbUser, organizations] = await Promise.all([
      prisma.user.findFirst({
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          emailVerified: true,
          featureFlags: true,
          v4BetaEnabled: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      }),
      prisma.organization.findMany({
        include: {
          projects: {
            where: {
              deletedAt: null,
            },
            orderBy: {
              name: "asc",
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      }),
    ]);
  } catch (error) {
    console.warn(
      "DEV ONLY: auth bypass is active, but session hydration from the database failed.",
      error,
    );
  }

  const userId = dbUser?.id ?? DEV_BYPASS_FALLBACK_USER.id;
  const userEmail = dbUser?.email ?? DEV_BYPASS_FALLBACK_USER.email;
  const userName = dbUser?.name ?? DEV_BYPASS_FALLBACK_USER.name;
  const hydratedOrganizations =
    organizations.length > 0
      ? organizations.map((organization) => {
          const parsedCloudConfig = CloudConfigSchema.safeParse(
            organization.cloudConfig,
          );
          const cloudConfig = parsedCloudConfig.success
            ? parsedCloudConfig.data
            : undefined;

          return {
            id: organization.id,
            name: organization.name,
            role: Role.OWNER,
            cloudConfig,
            plan: getOrganizationPlanServerSide(cloudConfig),
            metadata:
              (organization.metadata as Record<string, unknown> | null) ?? {},
            aiFeaturesEnabled: organization.aiFeaturesEnabled,
            projects: organization.projects.map((project) => ({
              id: project.id,
              name: project.name,
              deletedAt: project.deletedAt,
              retentionDays: project.retentionDays,
              hasTraces: project.hasTraces,
              metadata:
                (project.metadata as Record<string, unknown> | null) ?? {},
              role: Role.OWNER,
            })),
          };
        })
      : designModeOrganizations;

  return {
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    environment: {
      enableExperimentalFeatures:
        process.env.LANGFUSE_ENABLE_EXPERIMENTAL_FEATURES === "true",
      selfHostedInstancePlan: getSelfHostedInstancePlanServerSide(),
    },
    user: {
      id: userId,
      name: userName,
      email: userEmail,
      emailSupportHash: createSupportEmailHash(userEmail),
      image: dbUser?.image ?? undefined,
      admin: true,
      v4BetaEnabled: dbUser?.v4BetaEnabled ?? true,
      emailVerified:
        dbUser?.emailVerified?.toISOString() ?? new Date().toISOString(),
      canCreateOrganizations: true,
      featureFlags: parseFlags(dbUser?.featureFlags ?? []),
      organizations: hydratedOrganizations,
    },
  };
}

export { isDevAuthBypassEnabled };
