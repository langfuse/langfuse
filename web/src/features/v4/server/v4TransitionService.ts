/**
 * v4 transition orchestration: Postgres summaries, sidebar migration actions,
 * and re-exports for the tRPC router. SDK / events_core and system.query_log
 * logic live in sibling modules.
 */
import {
  AnalyticsIntegrationExportSource,
  type Prisma,
  type PrismaClient,
} from "@langfuse/shared/src/db";
import type { Session } from "next-auth";
import { isForceV3ExperienceProject } from "@langfuse/shared/src/server";
import {
  readExperimentPostUsageCache,
  readLegacyApiUsageCache,
} from "@/src/features/v4/server/v4TransitionCache";
import {
  getLegacyApiUsageSummaries,
  trimLegacyApiUsageRows,
} from "@/src/features/v4/server/v4TransitionQueryLogUsage";
import {
  deriveExperimentInstrumentationMigration,
  getSdkUsageSummaries,
  getSdkUsageSeriesByProject,
} from "@/src/features/v4/server/v4TransitionSdkUsage";
import { isActionableLegacyApiUsage } from "@/src/features/v4/utils";

export { getSdkUsageSummaries, getLegacyApiUsageSummaries };

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
  | "evaluationRule"
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

  const counts = await prisma.evaluationRule.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projectIds },
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

/**
 * Project-scoped migration evidence exposed by the v4 migration API.
 * Keep MCP and UI consumers on the same data sources and detection windows.
 */
export const getProjectV4MigrationData = async ({
  prisma,
  projectId,
}: {
  prisma: V4TransitionPrisma;
  projectId: string;
}) => {
  const projectIds = [projectId];
  const [sdkUsage, legacyIntegrations, legacyApiUsage, traceLevelEvals] =
    await Promise.all([
      getSdkUsageSummaries({ projectIds }),
      getLegacyIntegrationSummaries({ prisma, projectIds }),
      getLegacyApiUsageSummaries({ projectIds }),
      getTraceLevelEvalSummaries({ prisma, projectIds }),
    ]);

  return {
    projectId,
    forceV3Experience: isForceV3ExperienceProject(projectId),
    sdkUsage: sdkUsage[0]!,
    legacyIntegrations: legacyIntegrations[0]!,
    legacyApiUsage,
    traceLevelEvals: traceLevelEvals[0]!,
  };
};

/**
 * Migration signals for the always-mounted sidebar "Action required" pill.
 * SDK uses the same Redis + live gap-fill path as the panel summaries so the
 * pill cannot go stale relative to them. Deprecated API / experiment signals
 * read worker-maintained Redis caches when available (`null` = unknown).
 */
export const getMigrationActions = async ({
  prisma,
  projectId,
}: {
  prisma: PrismaClient;
  projectId: string;
}) => {
  // Forced-v3 projects are partner-managed: the client suppresses every
  // migration signal, so skip all I/O on this always-mounted hot path.
  if (isForceV3ExperienceProject(projectId)) {
    return {
      forceV3Experience: true,
      sdkActionNeeded: null,
      experimentsActionNeeded: null,
      apisActionNeeded: null,
      evalsActionNeeded: false,
      exportsActionNeeded: false,
    };
  }

  const nowMs = Date.now();
  const projectIds = [projectId];

  const [
    evalSummaries,
    integrationSummaries,
    seriesByProject,
    postBlobs,
    apiBlobs,
  ] = await Promise.all([
    getTraceLevelEvalSummaries({ prisma, projectIds }),
    getLegacyIntegrationSummaries({ prisma, projectIds }),
    getSdkUsageSeriesByProject({ projectIds, nowMs }),
    readExperimentPostUsageCache(projectIds),
    readLegacyApiUsageCache(projectIds),
  ]);

  const sdkUsageSeries = seriesByProject.get(projectId) ?? [];
  const postBlob = postBlobs[0] ?? null;
  const apiBlob = apiBlobs[0] ?? null;

  const experimentsActionNeeded =
    postBlob === null
      ? null
      : postBlob.used === false
        ? false
        : ["required", "sdk_usage_inconclusive"].includes(
            deriveExperimentInstrumentationMigration({
              sdkUsageSeries,
              postUsage: true,
            }).status,
          );

  return {
    forceV3Experience: isForceV3ExperienceProject(projectId),
    sdkActionNeeded: sdkUsageSeries.some(
      (series) => series.actionLevel === "required",
    ),
    experimentsActionNeeded,
    apisActionNeeded:
      apiBlob === null
        ? null
        : trimLegacyApiUsageRows(apiBlob.rows, nowMs).some(
            isActionableLegacyApiUsage,
          ),
    evalsActionNeeded: (evalSummaries[0]?.traceLevelEvalCount ?? 0) > 0,
    exportsActionNeeded:
      (integrationSummaries[0]?.legacyIntegrationCount ?? 0) > 0,
  };
};
