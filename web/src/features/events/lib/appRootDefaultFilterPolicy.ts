import type { FilterState } from "@langfuse/shared";
import { sdkVersionNeedsRefresh } from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

const URL_STATE_PARAMS = ["filter", "search", "searchType", "orderBy"];

export const APP_ROOT_OBSERVATION_FILTER = {
  column: "isRootObservation",
  type: "boolean",
  operator: "=",
  value: true,
} as const satisfies FilterState[number];

export const APP_ROOT_FILTER_STATE: FilterState = [APP_ROOT_OBSERVATION_FILTER];

export type AppRootFilterChangeOrigin = "user" | "saved_view" | "system";

const hasQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.length > 0 : Boolean(value);

export const viewOwnsEventsTableState = (
  query: Record<string, string | string[] | undefined>,
) => hasQueryValue(query.viewId);

export const urlOwnsEventsTableState = (
  query: Record<string, string | string[] | undefined>,
) =>
  viewOwnsEventsTableState(query) ||
  URL_STATE_PARAMS.some((key) => hasQueryValue(query[key]));

// useSessionStorage JSON-serializes null to the literal string "null".
export const storedViewOwnsEventsTableState = (value: string | null) =>
  Boolean(value) && value !== "null";

export const shouldQuerySdkVersion = (params: {
  enabled: boolean;
  routerReady: boolean;
  sdkCheckedAt: string | null;
  dismissed: boolean;
  now: number;
}) =>
  params.enabled &&
  params.routerReady &&
  !params.dismissed &&
  sdkVersionNeedsRefresh(params.sdkCheckedAt, params.now);

export const getAppRootDefaultPolicy = (params: {
  enabled: boolean;
  routerReady: boolean;
  appRootSupported: boolean;
  sdkCheckedAt: string | null;
  sdkCheckSettled: boolean;
  preference: string | null;
  defaultViewSettled: boolean;
  savedViewOwnsState: boolean;
  dismissed: boolean;
  now: number;
}) => {
  const sdkCheckCached = Number.isFinite(Date.parse(params.sdkCheckedAt ?? ""));
  const capabilitySupported =
    params.appRootSupported && (sdkCheckCached || params.sdkCheckSettled);
  const shouldApplyFilter =
    params.enabled &&
    params.routerReady &&
    capabilitySupported &&
    params.preference !== "suppressed" &&
    params.defaultViewSettled &&
    !params.savedViewOwnsState &&
    !params.dismissed;

  return {
    shouldApplyFilter,
    shouldPersistAuto: shouldApplyFilter && params.preference === null,
    shouldPersistSdkVersion:
      shouldQuerySdkVersion(params) && params.sdkCheckSettled,
  };
};

export const hasEnabledAppRootFilter = (filters: FilterState) =>
  filters.some(
    (filter) =>
      filter.column === APP_ROOT_OBSERVATION_FILTER.column &&
      filter.type === "boolean" &&
      filter.operator === "=" &&
      filter.value === true,
  );

export const removeAppRootDefaultFilter = (filters: FilterState) =>
  filters.filter(
    (filter) =>
      filter.column !== APP_ROOT_OBSERVATION_FILTER.column ||
      filter.type !== "boolean" ||
      filter.operator !== "=" ||
      filter.value !== true,
  );

export const getAppRootSavedViewComparisonFilters = (
  filters: FilterState,
  isAutoManaged: boolean,
) => (isAutoManaged ? removeAppRootDefaultFilter(filters) : filters);

export const getAppRootSuppressionToPersist = (params: {
  origin: AppRootFilterChangeOrigin;
  wasAutoManaged: boolean;
  previousFilters: FilterState;
  nextFilters: FilterState;
}) =>
  params.origin === "user" &&
  params.wasAutoManaged &&
  hasEnabledAppRootFilter(params.previousFilters) &&
  !hasEnabledAppRootFilter(params.nextFilters)
    ? ("suppressed" as const)
    : null;

export const shouldRunAppRootFallbackQuery = (params: {
  enabled: boolean;
  filters: FilterState;
  page: number;
  rootQuerySucceeded: boolean;
  rootQueryIsPlaceholder: boolean;
  rootRowCount: number;
}) =>
  params.enabled &&
  hasEnabledAppRootFilter(params.filters) &&
  params.page === 1 &&
  params.rootQuerySucceeded &&
  !params.rootQueryIsPlaceholder &&
  params.rootRowCount === 0;

export const getAppRootFallbackDecision = (params: {
  additionalRowsFound: boolean;
  isAutoManaged: boolean;
  filters: FilterState;
  searchQuery?: string | null;
  dateRange?: { from: Date; to?: Date };
  now: number;
}) => {
  const shouldRemoveFilter =
    params.additionalRowsFound &&
    params.isAutoManaged &&
    hasEnabledAppRootFilter(params.filters);
  const recentRange =
    params.dateRange &&
    params.dateRange.from.getTime() >= params.now - 7 * 86_400_000 &&
    (!params.dateRange.to ||
      params.dateRange.to.getTime() >= params.now - 300_000);

  return {
    shouldRemoveFilter,
    nextFilters: shouldRemoveFilter
      ? removeAppRootDefaultFilter(params.filters)
      : params.filters,
    shouldInvalidateSdkVersion:
      shouldRemoveFilter &&
      params.filters.length === 1 &&
      !params.searchQuery &&
      Boolean(recentRange),
  };
};
