import { useEffect } from "react";

import { api } from "@/src/utils/api";
import {
  sdkVersionNeedsRefresh,
  sdkVersionStorageKeys,
  toSdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { persistProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";

const readCachedSdkVersion = (projectId: string) => {
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

export function useProjectSdkVersionInfo(params: {
  projectId: string;
  enabled: boolean;
}) {
  const { projectId, enabled } = params;
  const cachedSdkVersion = readCachedSdkVersion(projectId);
  const now = Date.now();
  const shouldQuery =
    enabled && sdkVersionNeedsRefresh(cachedSdkVersion.checkedAt, now);
  const query = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    {
      enabled: shouldQuery,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  useEffect(() => {
    if (!query.isSuccess || query.isFetching || !query.data) return;

    const sdkVersion = toSdkVersionInfo(query.data);
    if (!sdkVersion) return;

    persistProjectSdkVersionInfo(
      projectId,
      sdkVersion,
      new Date(query.dataUpdatedAt).toISOString(),
    );
  }, [
    projectId,
    query.data,
    query.dataUpdatedAt,
    query.isFetching,
    query.isSuccess,
  ]);

  const queryCheckedAt =
    query.isSuccess && !query.isFetching && query.data
      ? new Date(query.dataUpdatedAt).toISOString()
      : null;

  return {
    sdkVersion: toSdkVersionInfo(query.data) ?? cachedSdkVersion.sdkVersion,
    checkedAt: queryCheckedAt ?? cachedSdkVersion.checkedAt,
  };
}
