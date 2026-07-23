import { useEffect } from "react";

import { api } from "@/src/utils/api";
import { useBrowserStorageValues } from "@/src/utils/browserStorage";
import {
  sdkVersionNeedsRefresh,
  sdkVersionStorageKeys,
  toSdkVersionInfo,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { persistProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";

export type ProjectSdkVersionRefreshMode = "if-stale" | "always";

export type ProjectSdkVersionState = {
  sdkVersion: SdkVersionInfo | undefined;
  checkedAt: string | null;
  isRefreshing: boolean;
  querySettled: boolean;
  isError: boolean;
};

const MIGRATION_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

export function useProjectsSdkVersionInfo(params: {
  projectIds: readonly string[];
  enabled: boolean;
  refreshMode: ProjectSdkVersionRefreshMode;
}): Map<string, ProjectSdkVersionState> {
  const { projectIds, enabled, refreshMode } = params;
  const storageKeys = projectIds.flatMap((projectId) => {
    const keys = sdkVersionStorageKeys(projectId);
    return [keys.language, keys.version, keys.checkedAt];
  });
  const storedValues = useBrowserStorageValues("localStorage", storageKeys);
  const now = Date.now();
  const shouldQuery = projectIds.map((_, index) => {
    const checkedAt = storedValues[index * 3 + 2] ?? null;
    return (
      enabled &&
      (refreshMode === "always" || sdkVersionNeedsRefresh(checkedAt, now))
    );
  });

  const queries = api.useQueries((t) =>
    projectIds.map((projectId, index) =>
      t.events.getSdkVersionInfo(
        { projectId },
        {
          enabled: shouldQuery[index],
          refetchOnWindowFocus: false,
          retry: false,
          staleTime:
            refreshMode === "always"
              ? MIGRATION_QUERY_STALE_TIME_MS
              : undefined,
        },
      ),
    ),
  );

  useEffect(() => {
    queries.forEach((query, index) => {
      if (!query.isSuccess || query.isFetching || !query.data) return;

      const sdkVersion = toSdkVersionInfo(query.data);
      if (!sdkVersion) return;

      persistProjectSdkVersionInfo(
        projectIds[index]!,
        sdkVersion,
        new Date(query.dataUpdatedAt).toISOString(),
      );
    });
  }, [projectIds, queries]);

  return new Map(
    projectIds.map((projectId, index) => {
      const query = queries[index];
      const cachedCheckedAt = storedValues[index * 3 + 2] ?? null;
      const cachedSdkVersion = cachedCheckedAt
        ? {
            language: storedValues[index * 3] ?? null,
            version: storedValues[index * 3 + 1] ?? null,
          }
        : undefined;

      return [
        projectId,
        {
          sdkVersion: toSdkVersionInfo(query?.data) ?? cachedSdkVersion,
          checkedAt: cachedCheckedAt,
          isRefreshing: Boolean(shouldQuery[index] && query?.isFetching),
          querySettled: Boolean(
            query?.isSuccess && !query.isFetching && query.data,
          ),
          isError: Boolean(query?.isError && !cachedSdkVersion),
        },
      ];
    }),
  );
}

export function useProjectSdkVersionInfo(params: {
  projectId: string;
  enabled: boolean;
  refreshMode: ProjectSdkVersionRefreshMode;
}): ProjectSdkVersionState {
  const sdkVersions = useProjectsSdkVersionInfo({
    projectIds: [params.projectId],
    enabled: params.enabled,
    refreshMode: params.refreshMode,
  });

  return (
    sdkVersions.get(params.projectId) ?? {
      sdkVersion: undefined,
      checkedAt: null,
      isRefreshing: false,
      querySettled: false,
      isError: false,
    }
  );
}
