import { normalizeIngestionSdkName, type FilterState } from "@langfuse/shared";

/**
 * App-root default policy overview:
 *
 * - supported SDK + neutral table -> cache capability and apply root filter
 * - URL/saved-view/user ownership -> do not apply the default
 * - user removes an auto root -> persist suppression
 * - auto root is empty and unfiltered rows exist -> remove root
 * - neutral, recent empty fallback -> also clear cached capability
 *
 * This module is pure. Hooks only gather inputs and execute these decisions.
 */

const APP_ROOT_SDK_MINIMUMS = {
  javascript: [5, 4, 0],
  python: [4, 7, 0],
} as const;

const TABLE_STATE_QUERY_PARAMS = [
  "filter",
  "search",
  "searchType",
  "orderBy",
] as const;

export const APP_ROOT_OBSERVATION_FILTER = {
  column: "isRootObservation",
  type: "boolean",
  operator: "=",
  value: true,
} as const satisfies FilterState[number];

export type AppRootDefaultOwner =
  | "pending"
  | "neutral"
  | "url"
  | "saved_view"
  | "user"
  | "fallback";

export type AppRootFilterChangeOrigin = "user" | "saved_view" | "system";

type SdkMetadata = {
  isOtel: boolean;
  name?: string;
  version?: string;
};

type AppRootPreference = string | null;

const hasQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "";

const isAppRootObservationFilter = (filter: FilterState[number]): boolean =>
  filter.column === APP_ROOT_OBSERVATION_FILTER.column;

export const urlOwnsEventsTableState = (
  query: Record<string, string | string[] | undefined>,
): boolean =>
  TABLE_STATE_QUERY_PARAMS.some((key) => hasQueryValue(query[key])) ||
  hasQueryValue(query.viewId);

export const viewOwnsEventsTableState = (
  query: Record<string, string | string[] | undefined>,
): boolean => hasQueryValue(query.viewId);

export const supportsAppRootFiltering = (sdk: SdkMetadata): boolean => {
  const name = normalizeIngestionSdkName(sdk.name);
  const minimum = name ? APP_ROOT_SDK_MINIMUMS[name] : undefined;
  const match = sdk.version
    ?.trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/);

  if (!sdk.isOtel || !minimum || !match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;

  const [minMajor, minMinor, minPatch] = minimum;
  return (
    major > minMajor ||
    (major === minMajor && minor > minMinor) ||
    (major === minMajor && minor === minMinor && patch >= minPatch)
  );
};

export const getAppRootDefaultPolicy = (params: {
  enabled: boolean;
  routerReady: boolean;
  hasUserId: boolean;
  sdkMetadata?: SdkMetadata;
  cachedCapability: string | null;
  preference: AppRootPreference;
  defaultViewSettled: boolean;
  savedViewOwnsState: boolean;
  currentViewOwnsState: boolean;
  owner: AppRootDefaultOwner;
  urlOwnsState: boolean;
}) => {
  const capabilityDetected = params.sdkMetadata
    ? supportsAppRootFiltering(params.sdkMetadata)
    : false;
  const capabilitySupported =
    params.cachedCapability === "supported" || capabilityDetected;
  let owner = params.owner;

  if (params.routerReady && owner === "pending") {
    owner = params.urlOwnsState ? "url" : "neutral";
  }
  if (
    params.routerReady &&
    owner === "neutral" &&
    !capabilitySupported &&
    params.urlOwnsState
  ) {
    owner = "url";
  }

  const shouldApplyFilter =
    params.enabled &&
    params.routerReady &&
    params.hasUserId &&
    capabilitySupported &&
    params.preference !== "suppressed" &&
    params.defaultViewSettled &&
    !params.savedViewOwnsState &&
    owner === "neutral";

  return {
    owner,
    capabilityDetected,
    capabilitySupported,
    shouldQueryCapability:
      params.enabled &&
      params.routerReady &&
      params.hasUserId &&
      params.preference !== "suppressed" &&
      params.cachedCapability !== "supported" &&
      owner !== "fallback",
    shouldCacheCapability: capabilityDetected && owner !== "fallback",
    shouldApplyFilter,
    shouldPersistAuto: shouldApplyFilter && params.preference === null,
    isAutoManaged: shouldApplyFilter && !params.currentViewOwnsState,
  };
};

export const hasEnabledAppRootFilter = (filters: FilterState): boolean =>
  filters.some(
    (filter) =>
      isAppRootObservationFilter(filter) &&
      filter.type === "boolean" &&
      filter.operator === "=" &&
      filter.value === true,
  );

export const removeAppRootDefaultFilter = (filters: FilterState): FilterState =>
  filters.filter(
    (filter) =>
      !(
        isAppRootObservationFilter(filter) &&
        filter.type === "boolean" &&
        filter.operator === "=" &&
        filter.value === true
      ),
  );

export const getAppRootFilterChangeDecision = (params: {
  origin: AppRootFilterChangeOrigin;
  wasAutoManaged: boolean;
  previousFilters: FilterState;
  nextFilters: FilterState;
}): {
  owner: Exclude<AppRootDefaultOwner, "pending" | "neutral" | "url">;
  preferenceToPersist: "suppressed" | null;
} => ({
  owner:
    params.origin === "user"
      ? "user"
      : params.origin === "saved_view"
        ? "saved_view"
        : "fallback",
  preferenceToPersist:
    params.origin === "user" &&
    params.wasAutoManaged &&
    hasEnabledAppRootFilter(params.previousFilters) &&
    !hasEnabledAppRootFilter(params.nextFilters)
      ? "suppressed"
      : null,
});

export const shouldRunAppRootFallbackQuery = (params: {
  enabled: boolean;
  filters: FilterState;
  page: number;
  rootQuerySucceeded: boolean;
  rootQueryIsPlaceholder: boolean;
  rootRowCount: number;
}): boolean =>
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
  const hasOnlySystemRoot =
    params.filters.length === 1 && hasEnabledAppRootFilter(params.filters);
  const recentRange =
    params.dateRange !== undefined &&
    params.dateRange.from.getTime() >= params.now - 7 * 24 * 60 * 60 * 1000 &&
    (!params.dateRange.to ||
      params.dateRange.to.getTime() >= params.now - 5 * 60 * 1000);

  return {
    shouldRemoveFilter,
    nextFilters: shouldRemoveFilter
      ? removeAppRootDefaultFilter(params.filters)
      : params.filters,
    shouldInvalidateCapability:
      shouldRemoveFilter &&
      hasOnlySystemRoot &&
      !params.searchQuery &&
      recentRange,
  };
};
