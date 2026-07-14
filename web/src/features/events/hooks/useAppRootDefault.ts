import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import { TableViewPresetTableName, type FilterState } from "@langfuse/shared";

import { api } from "@/src/utils/api";
import {
  APP_ROOT_OBSERVATION_FILTER,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootFilterChangeDecision,
  urlOwnsEventsTableState,
  viewOwnsEventsTableState,
  type AppRootDefaultOwner,
  type AppRootFilterChangeOrigin,
} from "@/src/features/events/lib/appRootDefaultPolicy";
import {
  appRootCapabilityStorageKey,
  appRootPreferenceStorageKey,
  appRootSavedViewSessionStorageKey,
  useBrowserStorageValue,
  writeStorage,
} from "@/src/features/events/lib/appRootDefaultStorage";

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

  const capabilityKey = appRootCapabilityStorageKey(projectId);
  const preferenceKey = appRootPreferenceStorageKey(
    userId ?? "anonymous",
    projectId,
  );
  const savedViewKey = appRootSavedViewSessionStorageKey(projectId);
  const cachedCapability = useBrowserStorageValue(
    "localStorage",
    capabilityKey,
  );
  const preference = useBrowserStorageValue("localStorage", preferenceKey);
  const restoredSavedViewId = useBrowserStorageValue(
    "sessionStorage",
    savedViewKey,
  );
  const currentUrlOwnsState = urlOwnsEventsTableState(router.query);
  const currentViewOwnsState = viewOwnsEventsTableState(router.query);
  const queryPolicy = getAppRootDefaultPolicy({
    enabled,
    routerReady: router.isReady,
    hasUserId: Boolean(userId),
    cachedCapability,
    preference,
    defaultViewSettled: false,
    savedViewOwnsState: false,
    currentViewOwnsState,
    owner,
    urlOwnsState: currentUrlOwnsState,
  });

  const capabilityQuery = api.events.getSdkVersionInfo.useQuery(
    { projectId },
    {
      enabled: queryPolicy.shouldQueryCapability,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  // Shares the same React Query cache as useTableViewManager. It lets the
  // default policy wait for default-view ownership without delaying SDK proof.
  const defaultViewQuery = api.TableViewPresets.getDefault.useQuery(
    { projectId, viewName: TableViewPresetTableName.ObservationsEvents },
    {
      enabled: enabled && router.isReady && Boolean(userId),
      staleTime: 5 * 60 * 1000,
    },
  );

  const savedViewOwnsState =
    Boolean(restoredSavedViewId) ||
    Boolean(defaultViewQuery.data?.viewId) ||
    owner === "saved_view";
  const policy = getAppRootDefaultPolicy({
    enabled,
    routerReady: router.isReady,
    hasUserId: Boolean(userId),
    sdkMetadata: capabilityQuery.data,
    cachedCapability,
    preference,
    defaultViewSettled: !defaultViewQuery.isLoading,
    savedViewOwnsState,
    currentViewOwnsState,
    owner,
    urlOwnsState: currentUrlOwnsState,
  });
  if (ownerState.projectId !== projectId || policy.owner !== owner) {
    setOwnerState({ projectId, owner: policy.owner });
  }

  useEffect(() => {
    if (policy.shouldCacheCapability) {
      writeStorage("localStorage", capabilityKey, "supported");
    }
  }, [capabilityKey, policy.shouldCacheCapability]);

  useEffect(() => {
    if (policy.shouldPersistAuto) {
      writeStorage("localStorage", preferenceKey, "auto");
    }
  }, [policy.shouldPersistAuto, preferenceKey]);

  const autoProvenanceKnown =
    preference === "auto" && !savedViewOwnsState && !currentViewOwnsState;
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

  const defaultExplicitFilterState = useMemo<FilterState>(
    () => (policy.shouldApplyFilter ? [APP_ROOT_OBSERVATION_FILTER] : []),
    [policy.shouldApplyFilter],
  );
  const removeCapabilityCache = useCallback(() => {
    writeStorage("localStorage", capabilityKey, null);
    utils.events.getSdkVersionInfo.reset({ projectId }).catch(() => undefined);
  }, [capabilityKey, projectId, utils.events.getSdkVersionInfo]);

  return {
    defaultExplicitFilterState,
    isAutoManaged: policy.isAutoManaged,
    onExplicitFilterStateChange,
    removeCapabilityCache,
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
  removeCapabilityCache: () => void;
}) {
  const {
    additionalRowsFound,
    isAutoManaged,
    filters,
    searchQuery,
    dateRange,
    setFilterState,
    removeCapabilityCache,
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
    if (decision.shouldInvalidateCapability) removeCapabilityCache();
  }, [
    additionalRowsFound,
    dateRange,
    filters,
    isAutoManaged,
    removeCapabilityCache,
    searchQuery,
    setFilterState,
  ]);
}
