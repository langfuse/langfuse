import { api } from "@/src/utils/api";
import {
  countActionableLegacyApiEntrypoints,
  isActionableLegacyApiUsage,
  normalizeLegacyApiEntrypoint,
} from "@/src/features/v4/utils";
import {
  getLegacyIntegrationLabels,
  getMigrationActionState,
  getMigrationCountState,
  type ProjectMigrationStatus,
} from "@/src/features/v4-migration/migrationData";
import { getV4MigrationSdkState } from "@/src/features/v4-migration/sdkVersionStatus";
import { useForceV3Experience } from "@/src/features/v4-migration/useForceV3Experience";

const QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export type V4MigrationOrganization = {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
};

const queryOptions = {
  refetchOnWindowFocus: false,
  staleTime: QUERY_STALE_TIME_MS,
};

export function useAccountV4MigrationData(params: {
  organizations: V4MigrationOrganization[];
  enabled: boolean;
}): Map<string, ProjectMigrationStatus> {
  const { organizations, enabled } = params;

  const integrationQueries = api.useQueries((t) =>
    organizations.map((organization) =>
      t.v4Transition.summaryByProject(
        { orgId: organization.id },
        {
          ...queryOptions,
          enabled,
        },
      ),
    ),
  );
  const evalQueries = api.useQueries((t) =>
    organizations.map((organization) =>
      t.v4Transition.traceLevelEvalSummaryByProject(
        { orgId: organization.id },
        {
          ...queryOptions,
          enabled,
          trpc: { context: { skipBatch: true } },
        },
      ),
    ),
  );
  const sdkQueries = api.useQueries((t) =>
    organizations.map((organization) =>
      t.v4Transition.sdkUsageSummaryByProject(
        { orgId: organization.id },
        {
          ...queryOptions,
          enabled,
          trpc: { context: { skipBatch: true } },
        },
      ),
    ),
  );
  const apiQueries = api.useQueries((t) =>
    organizations.map((organization) =>
      t.v4Transition.legacyApiUsageSummaryByProject(
        { orgId: organization.id },
        {
          ...queryOptions,
          enabled,
          trpc: { context: { skipBatch: true } },
        },
      ),
    ),
  );
  const statusByProjectId = new Map<string, ProjectMigrationStatus>();

  organizations.forEach((organization, organizationIndex) => {
    const integrationQuery = integrationQueries[organizationIndex] ?? null;
    const evalQuery = evalQueries[organizationIndex] ?? null;
    const sdkQuery = sdkQueries[organizationIndex] ?? null;
    const apiQuery = apiQueries[organizationIndex] ?? null;

    organization.projects.forEach((project) => {
      const sdkSummary = sdkQuery?.data?.find(
        (row) => row.projectId === project.id,
      );
      statusByProjectId.set(project.id, {
        sdk: getV4MigrationSdkState({
          summary: sdkSummary,
          isLoading: sdkQuery?.data === undefined && !sdkQuery?.isError,
          isError: sdkQuery?.isError ?? false,
        }),
        evals: getMigrationCountState(evalQuery, (rows) => {
          return (
            rows.find((row) => row.projectId === project.id)
              ?.traceLevelEvalCount ?? 0
          );
        }),
        experiments: getMigrationActionState(
          sdkQuery,
          (rows) =>
            rows.find((row) => row.projectId === project.id)
              ?.experimentInstrumentationMigration.status ?? "not_required",
        ),
        apis: getMigrationCountState(apiQuery, (rows) => {
          return countActionableLegacyApiEntrypoints(
            rows.filter((row) => row.projectId === project.id),
          );
        }),
        exports: getMigrationCountState(integrationQuery, (data) => {
          return (
            data.projects.find((row) => row.projectId === project.id)
              ?.legacyIntegrationCount ?? 0
          );
        }),
        // Forced-v3 projects still appear in the aggregation, marked as
        // partner-managed so surfaces can show "upgrade handled by your
        // integration partner" instead of a user-facing migration action.
        forceV3Experience:
          integrationQuery?.data?.projects.find(
            (row) => row.projectId === project.id,
          )?.forceV3Experience === true,
      });
    });
  });

  return statusByProjectId;
}

function useProjectV4SdkSummary(params: {
  projectId: string | undefined;
  enabled: boolean;
}) {
  const { projectId, enabled } = params;
  const queryEnabled = enabled && Boolean(projectId);
  const sdkQuery = api.v4Transition.sdkUsageSummary.useQuery(
    { projectId: projectId ?? "" },
    {
      ...queryOptions,
      enabled: queryEnabled,
      trpc: { context: { skipBatch: true } },
    },
  );
  return { sdkQuery, summary: sdkQuery.data };
}

export function useProjectV4SdkData(params: {
  projectId: string | undefined;
  enabled: boolean;
}) {
  const { sdkQuery, summary } = useProjectV4SdkSummary(params);

  return getV4MigrationSdkState({
    summary,
    isLoading: sdkQuery.data === undefined && !sdkQuery.isError,
    isError: sdkQuery.isError,
  });
}

export function useProjectV4EvalData(params: {
  projectId: string | undefined;
  enabled: boolean;
}) {
  const { projectId, enabled } = params;
  const queryEnabled = enabled && Boolean(projectId);
  const evalQuery = api.v4Transition.traceLevelEvalSummary.useQuery(
    { projectId: projectId ?? "" },
    { ...queryOptions, enabled: queryEnabled },
  );
  return getMigrationCountState(evalQuery, (data) => data.traceLevelEvalCount);
}

export function useProjectV4MigrationActions(projectId: string | undefined): {
  actionNeeded: boolean;
} {
  const query = api.v4Transition.migrationActions.useQuery(
    { projectId: projectId ?? "" },
    { ...queryOptions, enabled: Boolean(projectId) },
  );
  const actions = query.data;

  if (!actions || actions.forceV3Experience) {
    return { actionNeeded: false };
  }
  return {
    actionNeeded: [
      actions.sdkActionNeeded,
      actions.experimentsActionNeeded,
      actions.apisActionNeeded,
      actions.evalsActionNeeded,
      actions.exportsActionNeeded,
    ].some((categoryActionNeeded) => categoryActionNeeded === true),
  };
}

export function useProjectV4MigrationData(params: {
  projectId: string | undefined;
  enabled: boolean;
}) {
  const { projectId, enabled } = params;
  const queryEnabled = enabled && Boolean(projectId);
  const forceV3Experience = useForceV3Experience(projectId);
  const { sdkQuery, summary: sdkSummary } = useProjectV4SdkSummary({
    projectId,
    enabled,
  });
  const evalQuery = api.v4Transition.traceLevelEvalSummary.useQuery(
    { projectId: projectId ?? "" },
    { ...queryOptions, enabled: queryEnabled },
  );
  const apiQuery = api.v4Transition.legacyApiUsageSummary.useQuery(
    { projectId: projectId ?? "" },
    {
      ...queryOptions,
      enabled: queryEnabled,
      trpc: { context: { skipBatch: true } },
    },
  );
  const integrationQuery = api.v4Transition.summary.useQuery(
    { projectId: projectId ?? "" },
    { ...queryOptions, enabled: queryEnabled },
  );

  const apiUsage = (apiQuery.data ?? [])
    .map((row) => ({
      endpoint: normalizeLegacyApiEntrypoint(row.entrypoint),
      count: row.count,
      lastSeen: row.lastSeen,
      callers: Array.from(
        row.callers ?? [
          {
            count: row.count,
            lastSeen: row.lastSeen,
          },
        ],
      ).sort((left, right) => right.lastSeen.localeCompare(left.lastSeen)),
    }))
    .sort(
      (left, right) =>
        right.lastSeen.localeCompare(left.lastSeen) ||
        left.endpoint.localeCompare(right.endpoint),
    );
  const legacyIntegrations = getLegacyIntegrationLabels(
    integrationQuery.data?.legacyIntegrations,
  );

  return {
    sdk: getV4MigrationSdkState({
      summary: sdkSummary,
      isLoading: sdkQuery.data === undefined && !sdkQuery.isError,
      isError: sdkQuery.isError,
    }),
    evals: getMigrationCountState(
      evalQuery,
      (data) => data.traceLevelEvalCount,
    ),
    experiments: getMigrationActionState(
      sdkQuery,
      (summary) => summary.experimentInstrumentationMigration.status,
    ),
    experimentInstrumentationUpgradePath:
      sdkSummary?.experimentInstrumentationMigration.upgradePath ?? null,
    apis: getMigrationCountState(
      apiQuery,
      () => apiUsage.filter(isActionableLegacyApiUsage).length,
    ),
    exports: getMigrationCountState(
      integrationQuery,
      (data) => data.legacyIntegrationCount,
    ),
    forceV3Experience,
    apiUsage,
    legacyIntegrations,
  };
}
