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
 * Copy applies only to projects that still need a migration action.
 * Cutoff-exempt projects skip the v3 shutdown until November 23. December
 * projects keep their deadline until December 31.
 */
export async function getV4MigrationTopBannerState({
  prisma,
  session,
  demoOrgId,
  isLangfuseCloud,
  cutoffExemptProjectIds = [],
  decemberProjectIds = [],
}: {
  prisma: PrismaClient;
  session: Session;
  demoOrgId: string | undefined;
  isLangfuseCloud: boolean;
  cutoffExemptProjectIds?: readonly string[];
  decemberProjectIds?: readonly string[];
}): Promise<V4MigrationTopBannerState> {
  const user = session.user;
  if (!user) {
    return hiddenState;
  }

  const bannerConfig = getV4MigrationBannerConfig({ isLangfuseCloud });
  if (bannerConfig.severity === "off") {
    return hiddenState;
  }

  const eligibleOrganizations = (user.organizations ?? []).filter(
    (organization) => organization.id !== demoOrgId,
  );
  if (eligibleOrganizations.length === 0) {
    return hiddenState;
  }

  const projectIds = eligibleOrganizations.flatMap((organization) =>
    organization.projects
      .filter((project) => !project.deletedAt)
      .map((project) => project.id),
  );
  const present = (
    actionNeededProjectIds: readonly string[],
  ): V4MigrationTopBannerState => {
    const copy = resolveV4MigrationBannerCopy({
      actionNeededProjectIds,
      cutoffExemptProjectIds,
      decemberProjectIds,
    });
    if (!bannerConfig.message || !copy) {
      return {
        ...hiddenState,
        actionNeededCount: actionNeededProjectIds.length,
      };
    }
    return {
      ...copy,
      severity: bannerConfig.severity,
      message: copy.message,
      actionNeededCount: actionNeededProjectIds.length,
    };
  };

  if (projectIds.length === 0) {
    return present([]);
  }

  const actionsByProject = await getMigrationActionsByProject({
    prisma,
    projectIds,
  });
  const actionNeededProjectIds = projectIds.filter((projectId) => {
    const actions = actionsByProject.get(projectId);
    return actions ? hasMigrationActionNeeded(actions) : false;
  });

  return present(actionNeededProjectIds);
}
