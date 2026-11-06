import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { getMigrationActionsByProject } from "@/src/features/v4/server/v4TransitionService";
import { hasMigrationActionNeeded } from "@/src/features/v4-migration/migrationData";
import { getV4MigrationBannerConfig } from "@/src/features/v4-migration/server/v4MigrationBannerConfig";

type V4MigrationTopBannerState = {
  severity: "off" | "warning" | "critical";
  message: string | null;
  actionNeededCount: number;
};

const hiddenState: V4MigrationTopBannerState = {
  severity: "off",
  message: null,
  actionNeededCount: 0,
};

/**
 * Returns one aggregate snapshot for the always-mounted top banner. Migration
 * actions are batched across every accessible project in the current scope.
 */
export async function getV4MigrationTopBannerState({
  prisma,
  session,
  demoOrgId,
  isLangfuseCloud,
}: {
  prisma: PrismaClient;
  session: Session;
  demoOrgId: string | undefined;
  isLangfuseCloud: boolean;
}): Promise<V4MigrationTopBannerState> {
  const user = session.user;
  if (!user) {
    return hiddenState;
  }

  const sessionOrganizations = user.organizations ?? [];
  const eligibleOrganizations = sessionOrganizations.filter(
    (organization) =>
      organization.id !== demoOrgId &&
      getV4MigrationBannerConfig({
        orgId: organization.id,
        isLangfuseCloud,
      }).severity !== "off",
  );

  if (eligibleOrganizations.length === 0) {
    return hiddenState;
  }

  const bannerConfig = getV4MigrationBannerConfig({
    orgId: eligibleOrganizations[0]!.id,
    isLangfuseCloud,
  });
  const projectIds = eligibleOrganizations.flatMap((organization) =>
    organization.projects
      .filter((project) => !project.deletedAt)
      .map((project) => project.id),
  );

  if (projectIds.length === 0) {
    return {
      severity: bannerConfig.severity,
      message: bannerConfig.message,
      actionNeededCount: 0,
    };
  }

  const actionsByProject = await getMigrationActionsByProject({
    prisma,
    projectIds,
  });
  const actionNeededCount = projectIds.filter((projectId) => {
    const actions = actionsByProject.get(projectId);
    return actions ? hasMigrationActionNeeded(actions) : false;
  }).length;

  return {
    severity: bannerConfig.severity,
    message: bannerConfig.message,
    actionNeededCount,
  };
}
