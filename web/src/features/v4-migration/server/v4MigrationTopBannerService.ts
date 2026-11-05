import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import {
  readV4MigrationBannerCache,
  writeV4MigrationBannerCache,
} from "@/src/features/v4/server/v4TransitionCache";
import {
  getMigrationActionsByProject,
  type MigrationActions,
} from "@/src/features/v4/server/v4TransitionService";
import { getLegacyApiBannerState } from "@/src/features/v4-migration/server/legacyApiBannerSource";

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

const hasActionNeeded = (actions: MigrationActions): boolean =>
  !actions.forceV3Experience &&
  [
    actions.sdkActionNeeded,
    actions.experimentsActionNeeded,
    actions.apisActionNeeded,
    actions.evalsActionNeeded,
    actions.exportsActionNeeded,
  ].some((actionNeeded) => actionNeeded === true);

/**
 * Returns one shared snapshot for the always-mounted top banner. The heavy
 * migration checks are cached in Redis by accessible project set, so users
 * with the same scope reuse the result across sessions and page loads.
 */
export async function getV4MigrationTopBannerState({
  prisma,
  session,
  orgId,
  demoOrgId,
  isLangfuseCloud,
}: {
  prisma: PrismaClient;
  session: Session;
  orgId: string | undefined;
  demoOrgId: string | undefined;
  isLangfuseCloud: boolean;
}): Promise<V4MigrationTopBannerState> {
  const user = session.user;
  if (!user) {
    return hiddenState;
  }

  const sessionOrganizations = user.organizations ?? [];
  const scopedOrganizations = (
    orgId
      ? sessionOrganizations.filter((organization) => organization.id === orgId)
      : sessionOrganizations
  ).filter((organization) => organization.id !== demoOrgId);
  const eligibleOrganizations = scopedOrganizations.filter(
    (organization) =>
      getLegacyApiBannerState({
        orgId: organization.id,
        isLangfuseCloud,
      }).severity !== "off",
  );

  if (eligibleOrganizations.length === 0) {
    return hiddenState;
  }

  const bannerState = getLegacyApiBannerState({
    orgId: eligibleOrganizations[0]!.id,
    isLangfuseCloud,
  });
  const eligibleOrgIds = eligibleOrganizations.map(
    (organization) => organization.id,
  );
  const accessibleProjectIds = eligibleOrganizations.flatMap((organization) =>
    organization.projects
      .filter((project) => !project.deletedAt)
      .map((project) => project.id),
  );

  if (!user.admin && accessibleProjectIds.length === 0) {
    return {
      severity: bannerState.severity,
      message: bannerState.message,
      actionNeededCount: 0,
    };
  }

  const projects = await prisma.project.findMany({
    where: {
      orgId: { in: eligibleOrgIds },
      deletedAt: null,
      ...(user.admin ? {} : { id: { in: accessibleProjectIds } }),
    },
    select: { id: true },
  });
  const projectIds = projects.map((project) => project.id);

  if (projectIds.length === 0) {
    return {
      severity: bannerState.severity,
      message: bannerState.message,
      actionNeededCount: 0,
    };
  }

  const cached = await readV4MigrationBannerCache(projectIds);
  if (cached) {
    return {
      severity: bannerState.severity,
      message: bannerState.message,
      actionNeededCount: cached.actionNeededCount,
    };
  }

  const actionsByProject = await getMigrationActionsByProject({
    prisma,
    projectIds,
  });
  const actionNeededCount = projectIds.filter((projectId) => {
    const actions = actionsByProject.get(projectId);
    return actions ? hasActionNeeded(actions) : false;
  }).length;

  await writeV4MigrationBannerCache(projectIds, { actionNeededCount });

  return {
    severity: bannerState.severity,
    message: bannerState.message,
    actionNeededCount,
  };
}
