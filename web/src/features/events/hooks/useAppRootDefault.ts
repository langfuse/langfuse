import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";

import { api } from "@/src/utils/api";
import {
  APP_ROOT_FILTER_STATE,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootSuppressionToPersist,
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
import { getSdkVersionCapability } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";
import { useProjectSdkVersionInfo } from "@/src/features/sdk-version/hooks/useProjectSdkVersionInfo";
import { clearProjectSdkVersionInfo } from "@/src/features/sdk-version/lib/sdkVersionStorage";

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

  const preferenceKey = appRootPreferenceStorageKey(projectId);
  const savedViewKey = appRootSavedViewSessionStorageKey(projectId);
  const preference = useBrowserStorageValue("localStorage", preferenceKey);
  const restoredSavedViewId = useBrowserStorageValue(
    "sessionStorage",
    savedViewKey,
  );
  const currentViewOwnsState = viewOwnsEventsTableState(router.query);
  const now = Date.now();

  const sdkVersionState = useProjectSdkVersionInfo({
    projectId,
    enabled: enabled && router.isReady && !dismissed,
  });

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
  const appRootSupported = getSdkVersionCapability(
    sdkVersionState.sdkVersion,
    "appRootObservations",
  );
  const policy = getAppRootDefaultPolicy({
    enabled,
    routerReady: router.isReady,
    appRootSupported,
    sdkCheckedAt: sdkVersionState.checkedAt,
    preference,
    defaultViewSettled: !defaultViewQuery.isLoading,
    savedViewOwnsState,
    dismissed,
    now,
  });

  useEffect(() => {
    if (policy.shouldPersistAuto) {
      writeStorage("localStorage", preferenceKey, "auto");
    }
  }, [policy.shouldPersistAuto, preferenceKey]);

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
    clearProjectSdkVersionInfo(projectId);
    utils.events.getSdkVersionInfo.reset({ projectId }).catch(() => undefined);
  }, [projectId, utils.events.getSdkVersionInfo]);

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
