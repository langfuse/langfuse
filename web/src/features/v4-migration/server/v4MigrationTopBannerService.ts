import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { getMigrationActionsByProject } from "@/src/features/v4/server/v4TransitionService";
import { hasMigrationActionNeeded } from "@/src/features/v4-migration/migrationData";
import { getV4MigrationBannerConfig } from "@/src/features/v4-migration/server/v4MigrationBannerConfig";
import {
  resolveV4MigrationBannerCopy,
  V4_MIGRATION_STATUS_HREF,
  V4_MIGRATION_STATUS_LINK_LABEL,
  V4_MIGRATION_STATUS_MOBILE_LABEL,
  type V4MigrationBannerVariant,
} from "@/src/features/v4-migration/v4MigrationBannerCopy";

type V4MigrationTopBannerState = {
  severity: "off" | "warning" | "critical";
  message: string | null;
  href: string;
  linkLabel: string;
  mobileLabel: string;
  variant: V4MigrationBannerVariant;
  actionNeededCount: number;
};

const hiddenState: V4MigrationTopBannerState = {
  severity: "off",
  message: null,
  href: V4_MIGRATION_STATUS_HREF,
  linkLabel: V4_MIGRATION_STATUS_LINK_LABEL,
  mobileLabel: V4_MIGRATION_STATUS_MOBILE_LABEL,
  variant: "deadline",
  actionNeededCount: 0,
};

/**
 * Returns one aggregate snapshot for the always-mounted top banner. Migration
 * actions are batched across every accessible project in the current scope.
 * Brownout and extended-deadline copy apply only to projects that still need
 * a migration action.
 */
export async function getV4MigrationTopBannerState({
  prisma,
  session,
  demoOrgId,
  isLangfuseCloud,
  brownoutProjectIds = [],
  extendedOrgIds = [],
}: {
  prisma: PrismaClient;
  session: Session;
  demoOrgId: string | undefined;
  isLangfuseCloud: boolean;
  brownoutProjectIds?: readonly string[];
  extendedOrgIds?: readonly string[];
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
  const projects = eligibleOrganizations.flatMap((organization) =>
    organization.projects
      .filter((project) => !project.deletedAt)
      .map((project) => ({
        projectId: project.id,
        orgId: organization.id,
      })),
  );
  const present = (
    actionNeededProjects: readonly { projectId: string; orgId: string }[],
  ): V4MigrationTopBannerState => {
    const copy = resolveV4MigrationBannerCopy({
      actionNeededProjects,
      brownoutProjectIds,
      extendedOrgIds,
    });
    if (!bannerConfig.message || !copy) {
      return {
        ...hiddenState,
        actionNeededCount: actionNeededProjects.length,
      };
    }
    return {
      ...copy,
      severity: bannerConfig.severity,
      message: copy.message,
      actionNeededCount: actionNeededProjects.length,
    };
  };

  if (projects.length === 0) {
    return present([]);
  }

  const actionsByProject = await getMigrationActionsByProject({
    prisma,
    projectIds: projects.map((project) => project.projectId),
  });
  const actionNeededProjects = projects.filter((project) => {
    const actions = actionsByProject.get(project.projectId);
    return actions ? hasMigrationActionNeeded(actions) : false;
  });

  return present(actionNeededProjects);
}
