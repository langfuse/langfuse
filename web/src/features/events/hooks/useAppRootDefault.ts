import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";

import { api } from "@/src/utils/api";
import {
  APP_ROOT_FILTER_STATE,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootSuppressionToPersist,
  shouldQuerySdkVersion,
  storedViewOwnsEventsTableState,
  urlOwnsEventsTableState,
  viewOwnsEventsTableState,
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
  const utils = api.useUtils();

  // The default's only session state: has it been dismissed for this project?
  // URL-carried table state (filter/search/sort/viewId) dismisses on the
  // FIRST router-ready render only — params the table itself writes later
  // (e.g. ?search) must not retroactively dismiss. Explicit filter changes
  // dismiss via `dismissDefault` below.
  const [dismissal, setDismissal] = useState<{
    projectId: string;
    arrivalChecked: boolean;
    dismissed: boolean;
  }>(() => ({ projectId, arrivalChecked: false, dismissed: false }));
  const baseDismissal =
    dismissal.projectId === projectId
      ? dismissal
      : { projectId, arrivalChecked: false, dismissed: false };
  const nextDismissal =
    router.isReady && !baseDismissal.arrivalChecked
      ? {
          projectId,
          arrivalChecked: true,
          dismissed:
            baseDismissal.dismissed || urlOwnsEventsTableState(router.query),
        }
      : baseDismissal;
  if (nextDismissal !== dismissal) {
    setDismissal(nextDismissal);
  }
  const dismissed = nextDismissal.dismissed;

  const dismissDefault = useCallback(() => {
    setDismissal((current) =>
      current.projectId === projectId && current.dismissed
        ? current
        : { projectId, arrivalChecked: true, dismissed: true },
    );
  }, [projectId]);

  const {
    language: sdkLanguageKey,
    version: sdkVersionKey,
    checkedAt: sdkCheckedAtKey,
  } = sdkVersionStorageKeys(projectId);
  const preferenceKey = appRootPreferenceStorageKey(projectId);
  const savedViewKey = appRootSavedViewSessionStorageKey(projectId);
  const sdkLanguage = useBrowserStorageValue("localStorage", sdkLanguageKey);
  const sdkVersion = useBrowserStorageValue("localStorage", sdkVersionKey);
  const sdkCheckedAt = useBrowserStorageValue("localStorage", sdkCheckedAtKey);
  const preference = useBrowserStorageValue("localStorage", preferenceKey);
  const restoredSavedViewId = useBrowserStorageValue(
    "sessionStorage",
    savedViewKey,
  );
  const currentViewOwnsState = viewOwnsEventsTableState(router.query);
  const now = Date.now();

  const sdkQuery = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    {
      enabled: shouldQuerySdkVersion({
        enabled,
        routerReady: router.isReady,
        sdkCheckedAt,
        dismissed,
        now,
      }),
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const defaultViewQuery = api.TableViewPresets.getDefault.useQuery(
    { projectId, viewName: TableViewPresetTableName.ObservationsEvents },
    {
      enabled: enabled && router.isReady,
      staleTime: 5 * 60 * 1000,
    },
  );

  const savedViewOwnsState =
    currentViewOwnsState ||
    storedViewOwnsEventsTableState(restoredSavedViewId) ||
    Boolean(defaultViewQuery.data?.viewId);
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
    appRootSupported,
    sdkCheckedAt,
    sdkCheckSettled,
    preference,
    defaultViewSettled: !defaultViewQuery.isLoading,
    savedViewOwnsState,
    dismissed,
    now,
  });

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
      writeStorage("localStorage", sdkCheckedAtKey, new Date().toISOString());
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

      const preferenceToPersist = getAppRootSuppressionToPersist({
        ...change,
        wasAutoManaged: policy.shouldApplyFilter || autoProvenanceKnown,
      });
      dismissDefault();
      if (preferenceToPersist) {
        writeStorage("localStorage", preferenceKey, preferenceToPersist);
      }
    },
    [
      autoProvenanceKnown,
      dismissDefault,
      enabled,
      policy.shouldApplyFilter,
      preferenceKey,
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
    isAutoManaged: policy.shouldApplyFilter,
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
