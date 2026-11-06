import type { PrismaClient } from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { getMigrationActionsByProject } from "@/src/features/v4/server/v4TransitionService";
import { hasMigrationActionNeeded } from "@/src/features/v4-migration/migrationData";
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

/**
 * Returns one aggregate snapshot for the always-mounted top banner. Migration
 * actions are batched across every accessible project in the current scope.
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
  const scopedOrgIds = (
    orgId
      ? [orgId]
      : sessionOrganizations.map((organization) => organization.id)
  ).filter((organizationId) => organizationId !== demoOrgId);
  const eligibleOrgIds = scopedOrgIds.filter(
    (organizationId) =>
      getLegacyApiBannerState({
        orgId: organizationId,
        isLangfuseCloud,
      }).severity !== "off",
  );

  if (eligibleOrgIds.length === 0) {
    return hiddenState;
  }

  const bannerState = getLegacyApiBannerState({
    orgId: eligibleOrgIds[0]!,
    isLangfuseCloud,
  });
  const accessibleProjectIds = sessionOrganizations
    .filter((organization) => eligibleOrgIds.includes(organization.id))
    .flatMap((organization) =>
      organization.projects
        .filter((project) => !project.deletedAt)
        .map((project) => project.id),
    );

  // The organization procedure authorizes and audits out-of-session scopes,
  // which occur when a global admin views a customer organization.
  const organizationIsOutsideSession =
    orgId !== undefined &&
    !sessionOrganizations.some((organization) => organization.id === orgId);
  const projectIds = organizationIsOutsideSession
    ? (
        await prisma.project.findMany({
          where: {
            orgId: { in: eligibleOrgIds },
            deletedAt: null,
          },
          select: { id: true },
        })
      ).map((project) => project.id)
    : accessibleProjectIds;

  if (projectIds.length === 0) {
    return {
      severity: bannerState.severity,
      message: bannerState.message,
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
    severity: bannerState.severity,
    message: bannerState.message,
    actionNeededCount,
  };
}
