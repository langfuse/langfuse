import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";

import { api } from "@/src/utils/api";
import {
  APP_ROOT_FILTER_STATE,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootFilterChangeDecision,
  storedViewOwnsEventsTableState,
  urlOwnsEventsTableState,
  viewOwnsEventsTableState,
  type AppRootDefaultOwner,
  type AppRootFilterChangeOrigin,
} from "@/src/features/events/lib/appRootDefaultFilterPolicy";
import {
  appRootPreferenceStorageKey,
  appRootSavedViewSessionStorageKey,
  useBrowserStorageValue,
  writeStorage,
} from "@/src/features/events/lib/appRootDefaultStorage";
import {
  getSdkVersionCapability,
  sdkVersionStorageKeys,
  toSdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

export function useAppRootDefault(params: {
  enabled: boolean;
  projectId: string;
}) {
  const { enabled, projectId } = params;
  const router = useRouter();
  const userId = useSession().data?.user?.id;
  const utils = api.useUtils();
  const [ownerState, setOwnerState] = useState<{
    projectId: string;
    owner: AppRootDefaultOwner;
  }>(() => ({ projectId, owner: "pending" }));
  const owner =
    ownerState.projectId === projectId ? ownerState.owner : "pending";

  const {
    language: sdkLanguageKey,
    version: sdkVersionKey,
    checkedAt: sdkCheckedAtKey,
  } = sdkVersionStorageKeys(projectId);
  const preferenceKey = appRootPreferenceStorageKey(
    userId ?? "anonymous",
    projectId,
  );
  const savedViewKey = appRootSavedViewSessionStorageKey(projectId);
  const sdkLanguage = useBrowserStorageValue(
    "localStorage",
    sdkLanguageKey,
  );
  const sdkVersion = useBrowserStorageValue(
    "localStorage",
    sdkVersionKey,
  );
  const sdkCheckedAt = useBrowserStorageValue(
    "localStorage",
    sdkCheckedAtKey,
  );
  const cachedAppRootSupported = getSdkVersionCapability(
    sdkCheckedAt ? { language: sdkLanguage, version: sdkVersion } : undefined,
    "appRootObservations",
  );
  const preference = useBrowserStorageValue("localStorage", preferenceKey);
  const restoredSavedViewId = useBrowserStorageValue(
    "sessionStorage",
    savedViewKey,
  );
  const currentUrlOwnsState = urlOwnsEventsTableState(router.query);
  const currentViewOwnsState = viewOwnsEventsTableState(router.query);
  const now = Date.now();
  const queryPolicy = getAppRootDefaultPolicy({
    enabled,
    routerReady: router.isReady,
    hasUserId: Boolean(userId),
    appRootSupported: cachedAppRootSupported,
    sdkCheckedAt,
    sdkCheckSettled: false,
    preference,
    defaultViewSettled: false,
    savedViewOwnsState: false,
    owner,
    urlOwnsState: currentUrlOwnsState,
    now,
  });

  const sdkQuery = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    {
      enabled: queryPolicy.shouldQuerySdkVersion,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const defaultViewQuery = api.TableViewPresets.getDefault.useQuery(
    { projectId, viewName: TableViewPresetTableName.ObservationsEvents },
    {
      enabled: enabled && router.isReady && Boolean(userId),
      staleTime: 5 * 60 * 1000,
    },
  );

  const savedViewOwnsState =
    currentViewOwnsState ||
    storedViewOwnsEventsTableState(restoredSavedViewId) ||
    Boolean(defaultViewQuery.data?.viewId) ||
    owner === "saved_view";
  const sdkCheckSettled = sdkQuery.isSuccess && !sdkQuery.isFetching;
  const checkedSdkVersion = toSdkVersionInfo(
    sdkCheckSettled ? sdkQuery.data : undefined,
  );
  const appRootSupported = getSdkVersionCapability(
    checkedSdkVersion ??
      (sdkCheckedAt
        ? { language: sdkLanguage, version: sdkVersion }
        : undefined),
    "appRootObservations",
  );
  const policy = getAppRootDefaultPolicy({
    enabled,
    routerReady: router.isReady,
    hasUserId: Boolean(userId),
    appRootSupported,
    sdkCheckedAt,
    sdkCheckSettled,
    preference,
    defaultViewSettled: !defaultViewQuery.isLoading,
    savedViewOwnsState,
    owner,
    urlOwnsState: currentUrlOwnsState,
    now,
  });
  if (ownerState.projectId !== projectId || policy.owner !== owner) {
    setOwnerState({ projectId, owner: policy.owner });
  }

  useEffect(() => {
    if (policy.shouldPersistSdkVersion) {
      writeStorage(
        "localStorage",
        sdkLanguageKey,
        checkedSdkVersion?.language ?? null,
      );
      writeStorage(
        "localStorage",
        sdkVersionKey,
        checkedSdkVersion?.version ?? null,
      );
      writeStorage(
        "localStorage",
        sdkCheckedAtKey,
        new Date().toISOString(),
      );
    }
    if (policy.shouldPersistAuto) {
      writeStorage("localStorage", preferenceKey, "auto");
    }
  }, [
    checkedSdkVersion?.language,
    checkedSdkVersion?.version,
    policy.shouldPersistSdkVersion,
    policy.shouldPersistAuto,
    preferenceKey,
    sdkCheckedAtKey,
    sdkLanguageKey,
    sdkVersionKey,
  ]);

  const autoProvenanceKnown = preference === "auto" && !savedViewOwnsState;
  const onExplicitFilterStateChange = useCallback(
    (change: {
      previousFilters: FilterState;
      nextFilters: FilterState;
      origin: AppRootFilterChangeOrigin;
    }) => {
      if (!enabled) return;

      const filterDecision = getAppRootFilterChangeDecision({
        ...change,
        wasAutoManaged: policy.shouldApplyFilter || autoProvenanceKnown,
      });
      setOwnerState({ projectId, owner: filterDecision.owner });
      if (filterDecision.preferenceToPersist) {
        writeStorage(
          "localStorage",
          preferenceKey,
          filterDecision.preferenceToPersist,
        );
      }
    },
    [
      autoProvenanceKnown,
      enabled,
      policy.shouldApplyFilter,
      preferenceKey,
      projectId,
    ],
  );

  const removeSdkVersionCache = useCallback(() => {
    writeStorage("localStorage", sdkCheckedAtKey, null);
    writeStorage("localStorage", sdkLanguageKey, null);
    writeStorage("localStorage", sdkVersionKey, null);
    utils.events.getSdkVersionInfo.reset({ projectId }).catch(() => undefined);
  }, [
    projectId,
    sdkCheckedAtKey,
    sdkLanguageKey,
    sdkVersionKey,
    utils.events.getSdkVersionInfo,
  ]);

  return {
    defaultExplicitFilterState: policy.shouldApplyFilter
      ? APP_ROOT_FILTER_STATE
      : [],
    isAutoManaged: policy.isAutoManaged,
    onExplicitFilterStateChange,
    removeSdkVersionCache,
  };
}

export function useApplyAppRootFallback(params: {
  additionalRowsFound: boolean;
  isAutoManaged: boolean;
  filters: FilterState;
  searchQuery?: string | null;
  dateRange?: { from: Date; to?: Date };
  setFilterState: (
    filters: FilterState,
    options: { updateType: "replaceIn"; origin: "system" },
  ) => void;
  removeSdkVersionCache: () => void;
}) {
  const {
    additionalRowsFound,
    isAutoManaged,
    filters,
    searchQuery,
    dateRange,
    setFilterState,
    removeSdkVersionCache,
  } = params;

  useEffect(() => {
    const decision = getAppRootFallbackDecision({
      additionalRowsFound,
      isAutoManaged,
      filters,
      searchQuery,
      dateRange,
      now: Date.now(),
    });
    if (!decision.shouldRemoveFilter) return;

    setFilterState(decision.nextFilters, {
      updateType: "replaceIn",
      origin: "system",
    });
    if (decision.shouldInvalidateSdkVersion) removeSdkVersionCache();
  }, [
    additionalRowsFound,
    dateRange,
    filters,
    isAutoManaged,
    removeSdkVersionCache,
    searchQuery,
    setFilterState,
  ]);
}
