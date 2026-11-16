import { api } from "@/src/utils/api";

const ACCESS_STALE_TIME_MS = 5 * 60 * 1000;

/** Whether the project's organization passes the external media storage gate (entitlement or allowlist). */
export function useHasExternalMediaStorageAccess(
  projectId: string | undefined,
) {
  const query = api.externalMediaStorage.isFeatureEnabled.useQuery(
    { projectId: projectId ?? "" },
    {
      enabled: Boolean(projectId),
      staleTime: ACCESS_STALE_TIME_MS,
      retry: false,
      // Viewers without project access (e.g. on public traces) get the raw URI.
      meta: { silentAllErrors: true },
    },
  );
  return query.data === true;
}
