import { normalizeIngestionSdkName, type FilterState } from "@langfuse/shared";

const SDK_MINIMUMS = {
  javascript: [5, 4, 0],
  python: [4, 7, 0],
} as const;
const CAPABILITY_RECHECK_MS = 30 * 86_400_000;
const URL_STATE_PARAMS = ["filter", "search", "searchType", "orderBy"];
const OWNER_BY_ORIGIN = {
  user: "user",
  saved_view: "saved_view",
  system: "fallback",
} as const;

export const APP_ROOT_OBSERVATION_FILTER = {
  column: "isRootObservation",
  type: "boolean",
  operator: "=",
  value: true,
} as const satisfies FilterState[number];

export const APP_ROOT_FILTER_STATE: FilterState = [APP_ROOT_OBSERVATION_FILTER];

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

export const supportsAppRootFiltering = (sdk: SdkMetadata) => {
  const name = normalizeIngestionSdkName(sdk.name);
  const minimum = name ? SDK_MINIMUMS[name] : undefined;
  const match = sdk.version
    ?.trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/);
  if (!sdk.isOtel || !minimum || !match) return false;

  const version = match.slice(1, 4).map(Number);
  if (!version.every(Number.isSafeInteger)) return false;
  for (let index = 0; index < version.length; index++) {
    if (version[index] !== minimum[index]) {
      return version[index]! > minimum[index]!;
    }
  }
  return true;
};

export const getAppRootDefaultPolicy = (params: {
  enabled: boolean;
  routerReady: boolean;
  hasUserId: boolean;
  sdkMetadata?: SdkMetadata;
  cachedCapability: string | null;
  preference: string | null;
  defaultViewSettled: boolean;
  savedViewOwnsState: boolean;
  owner: AppRootDefaultOwner;
  urlOwnsState: boolean;
  now: number;
}) => {
  const capabilityDetected = params.sdkMetadata
    ? supportsAppRootFiltering(params.sdkMetadata)
    : false;
  const hasCachedCapability = params.cachedCapability !== null;
  const cachedAt = Date.parse(params.cachedCapability ?? "");
  const capabilityNeedsRecheck =
    !hasCachedCapability ||
    !Number.isFinite(cachedAt) ||
    params.now - cachedAt >= CAPABILITY_RECHECK_MS;
  const capabilitySupported = hasCachedCapability || capabilityDetected;
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

  const active = params.enabled && params.routerReady && params.hasUserId;
  const shouldApplyFilter =
    active &&
    capabilitySupported &&
    params.preference !== "suppressed" &&
    params.defaultViewSettled &&
    !params.savedViewOwnsState &&
    owner === "neutral";

  return {
    owner,
    shouldApplyFilter,
    isAutoManaged: shouldApplyFilter,
    shouldPersistAuto: shouldApplyFilter && params.preference === null,
    shouldWriteCapabilityTimestamp:
      active &&
      capabilityNeedsRecheck &&
      owner !== "fallback" &&
      (capabilityDetected ||
        (hasCachedCapability && params.sdkMetadata !== undefined)),
    shouldQueryCapability:
      active &&
      params.preference !== "suppressed" &&
      capabilityNeedsRecheck &&
      owner !== "fallback",
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

export const getAppRootFilterChangeDecision = (params: {
  origin: AppRootFilterChangeOrigin;
  wasAutoManaged: boolean;
  previousFilters: FilterState;
  nextFilters: FilterState;
}) => ({
  owner: OWNER_BY_ORIGIN[params.origin],
  preferenceToPersist:
    params.origin === "user" &&
    params.wasAutoManaged &&
    hasEnabledAppRootFilter(params.previousFilters) &&
    !hasEnabledAppRootFilter(params.nextFilters)
      ? ("suppressed" as const)
      : null,
});

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
    shouldInvalidateCapability:
      shouldRemoveFilter &&
      params.filters.length === 1 &&
      !params.searchQuery &&
      Boolean(recentRange),
  };
};
