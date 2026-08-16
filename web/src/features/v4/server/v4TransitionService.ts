/**
 * v4 transition orchestration: Postgres summaries and re-exports for the
 * tRPC router. SDK / events_core and system.query_log logic live in sibling
 * modules.
 */
import {
  AnalyticsIntegrationExportSource,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import type { Session } from "next-auth";

export { getSdkUsageSummaries } from "@/src/features/v4/server/v4TransitionSdkUsage";
export { getLegacyApiUsageSummaries } from "@/src/features/v4/server/v4TransitionQueryLogUsage";

const legacyIntegrationExportSources =
  new Set<AnalyticsIntegrationExportSource>([
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
  ]);

const TRACE_EVAL_TARGET = "trace";
const DATASET_EVAL_TARGET = "dataset";

const isLegacyIntegrationExportSource = (
  exportSource: AnalyticsIntegrationExportSource | null | undefined,
) => exportSource != null && legacyIntegrationExportSources.has(exportSource);

const isEnabledLegacyIntegration = (
  integration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined,
) =>
  Boolean(
    integration?.enabled &&
    isLegacyIntegrationExportSource(integration.exportSource),
  );

type TraceLevelEvalSummaryResultRow = {
  projectId: string;
  traceLevelEvalCount: number;
};

type LegacyIntegrations = {
  posthog: boolean;
  mixpanel: boolean;
  blobStorage: boolean;
};

const getAccessibleOrganizationProjectWhere = ({
  orgId,
  session,
}: {
  orgId: string;
  session: Session;
}): Prisma.ProjectWhereInput => {
  const projectIds = session.user?.organizations
    .find((organization) => organization.id === orgId)
    ?.projects.map((project) => project.id);

  return {
    orgId,
    deletedAt: null,
    ...(session.user?.admin ? {} : { id: { in: projectIds ?? [] } }),
  };
};

const getLegacyIntegrations = ({
  posthogIntegration,
  mixpanelIntegration,
  blobStorageIntegration,
}: {
  posthogIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  mixpanelIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
  blobStorageIntegration:
    | { enabled: boolean; exportSource: AnalyticsIntegrationExportSource }
    | null
    | undefined;
}): LegacyIntegrations => ({
  posthog: isEnabledLegacyIntegration(posthogIntegration),
  mixpanel: isEnabledLegacyIntegration(mixpanelIntegration),
  blobStorage: isEnabledLegacyIntegration(blobStorageIntegration),
});

type V4TransitionPrisma = Pick<
  PrismaClient,
  | "project"
  | "posthogIntegration"
  | "mixpanelIntegration"
  | "blobStorageIntegration"
  | "jobConfiguration"
>;

export const getAccessibleOrganizationProjects = async ({
  prisma,
  orgId,
  session,
}: {
  prisma: V4TransitionPrisma;
  orgId: string;
  session: Session;
}) =>
  prisma.project.findMany({
    where: getAccessibleOrganizationProjectWhere({ orgId, session }),
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

export const getLegacyIntegrationSummaries = async ({
  prisma,
  projectIds,
}: {
  prisma: V4TransitionPrisma;
  projectIds: string[];
}) => {
  if (projectIds.length === 0) return [];

  const [posthogIntegrations, mixpanelIntegrations, blobStorageIntegrations] =
    await Promise.all([
      prisma.posthogIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
      prisma.mixpanelIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
      prisma.blobStorageIntegration.findMany({
        where: { projectId: { in: projectIds } },
        select: { projectId: true, enabled: true, exportSource: true },
      }),
    ]);

  const posthogByProjectId = new Map(
    posthogIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );
  const mixpanelByProjectId = new Map(
    mixpanelIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );
  const blobStorageByProjectId = new Map(
    blobStorageIntegrations.map((integration) => [
      integration.projectId,
      integration,
    ]),
  );

  return projectIds.map((projectId) => {
    const legacyIntegrations = getLegacyIntegrations({
      posthogIntegration: posthogByProjectId.get(projectId),
      mixpanelIntegration: mixpanelByProjectId.get(projectId),
      blobStorageIntegration: blobStorageByProjectId.get(projectId),
    });

    return {
      projectId,
      legacyIntegrationCount:
        Object.values(legacyIntegrations).filter(Boolean).length,
      legacyIntegrations,
    };
  });
};

export const getTraceLevelEvalSummaries = async ({
  prisma,
  projectIds,
}: {
  prisma: V4TransitionPrisma;
  projectIds: string[];
}): Promise<TraceLevelEvalSummaryResultRow[]> => {
  if (projectIds.length === 0) return [];

  const counts = await prisma.jobConfiguration.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
      jobType: "EVAL",
      targetObject: { in: [TRACE_EVAL_TARGET, DATASET_EVAL_TARGET] },
      status: "ACTIVE",
      timeScope: { has: "NEW" },
    },
    _count: { _all: true },
  });
  const countByProjectId = new Map(
    counts.map((row) => [row.projectId, row._count._all]),
  );

  return projectIds.map((projectId) => ({
    projectId,
    traceLevelEvalCount: countByProjectId.get(projectId) ?? 0,
  }));
};
