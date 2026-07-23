import { useEffect } from "react";

import { api } from "@/src/utils/api";
import {
  sdkVersionNeedsRefresh,
  sdkVersionStorageKeys,
  toSdkVersionInfo,
  type SdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { persistProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";

type ProjectSdkVersionRefreshMode = "if-stale" | "always";

export type ProjectSdkVersionState = {
  sdkVersion: SdkVersionInfo | undefined;
  checkedAt: string | null;
  isRefreshing: boolean;
  querySettled: boolean;
  isError: boolean;
};

const MIGRATION_QUERY_STALE_TIME_MS = 5 * 60 * 1000;

const readCachedSdkVersion = (
  projectId: string,
): Pick<ProjectSdkVersionState, "sdkVersion" | "checkedAt"> => {
  if (typeof window === "undefined") {
    return { sdkVersion: undefined, checkedAt: null };
  }

  try {
    const keys = sdkVersionStorageKeys(projectId);
    const checkedAt = window.localStorage.getItem(keys.checkedAt);
    return {
      sdkVersion: checkedAt
        ? {
            language: window.localStorage.getItem(keys.language),
            version: window.localStorage.getItem(keys.version),
            isOtel: window.localStorage.getItem(keys.isOtel) === "true",
          }
        : undefined,
      checkedAt,
    };
  } catch {
    return { sdkVersion: undefined, checkedAt: null };
  }
};

export function useProjectsSdkVersionInfo(params: {
  projectIds: readonly string[];
  enabled: boolean;
  refreshMode: ProjectSdkVersionRefreshMode;
}): Map<string, ProjectSdkVersionState> {
  const { projectIds, enabled, refreshMode } = params;
  const cachedSdkVersions = projectIds.map(readCachedSdkVersion);
  const now = Date.now();
  const shouldQuery = cachedSdkVersions.map(({ checkedAt }) => {
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
      const cachedSdkVersion = cachedSdkVersions[index]!;
      const querySettled = Boolean(
        query?.isSuccess && !query.isFetching && query.data,
      );
      const queryCheckedAt = querySettled
        ? new Date(query!.dataUpdatedAt).toISOString()
        : null;

      return [
        projectId,
        {
          sdkVersion:
            toSdkVersionInfo(query?.data) ?? cachedSdkVersion.sdkVersion,
          checkedAt: queryCheckedAt ?? cachedSdkVersion.checkedAt,
          isRefreshing: Boolean(shouldQuery[index] && query?.isFetching),
          querySettled,
          isError: Boolean(query?.isError && !cachedSdkVersion.sdkVersion),
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
