import type { FilterState } from "@langfuse/shared";

import {
  APP_ROOT_OBSERVATION_FILTER,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootSavedViewComparisonFilters,
  getAppRootSuppressionToPersist,
  removeAppRootDefaultFilter,
  shouldQuerySdkVersion,
  storedViewOwnsEventsTableState,
  urlOwnsEventsTableState,
} from "./appRootDefaultFilterPolicy";
import {
  getSdkVersionCapability,
  toSdkVersionInfo,
} from "@/src/features/sdk-version/lib/sdkVersionCapabilities";

const levelFilter: FilterState[number] = {
  column: "level",
  type: "stringOptions",
  operator: "any of",
  value: ["ERROR"],
};
const now = new Date("2026-07-14T12:00:00Z").getTime();
const basePolicy = {
  enabled: true,
  routerReady: true,
  appRootSupported: true,
  sdkCheckedAt: "2026-07-14T12:00:00.000Z",
  sdkCheckSettled: false,
  preference: null,
  defaultViewSettled: true,
  savedViewOwnsState: false,
  dismissed: false,
  now,
};

describe("app-root default policy", () => {
  it.each([
    ["javascript", "5.4.0", true],
    ["javascript", "5.3.9", false],
    ["typescript", "5.10.0", true],
    ["python", "4.7.0", true],
    ["python", "4.6.9", false],
    ["python", "4.7.0rc1", false],
    ["unknown", "99.0.0", false],
  ])("classifies %s %s", (name, version, expected) => {
    expect(
      getSdkVersionCapability(
        toSdkVersionInfo({ isOtel: true, name, version }),
        "appRootObservations",
      ),
    ).toBe(expected);
  });

  it.each([
    [{}, true],
    [{ enabled: false }, false],
    [{ sdkCheckedAt: null }, false],
    [{ appRootSupported: false }, false],
    [{ preference: "suppressed" }, false],
    [{ dismissed: true }, false],
    [{ savedViewOwnsState: true }, false],
  ])("resolves table eligibility %#", (override, apply) => {
    expect(
      getAppRootDefaultPolicy({ ...basePolicy, ...override }).shouldApplyFilter,
    ).toBe(apply);
  });

  it("queries the SDK version only when a refresh could matter", () => {
    const base = {
      enabled: true,
      routerReady: true,
      sdkCheckedAt: null,
      dismissed: false,
      now,
    };
    expect(shouldQuerySdkVersion(base)).toBe(true);
    expect(
      shouldQuerySdkVersion({
        ...base,
        sdkCheckedAt: "2026-07-14T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      shouldQuerySdkVersion({
        ...base,
        sdkCheckedAt: "2026-05-01T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(shouldQuerySdkVersion({ ...base, dismissed: true })).toBe(false);
  });

  it("persists the SDK check only after it settles", () => {
    const stale = { ...basePolicy, sdkCheckedAt: null };
    expect(getAppRootDefaultPolicy(stale).shouldPersistSdkVersion).toBe(false);
    expect(
      getAppRootDefaultPolicy({ ...stale, sdkCheckSettled: true })
        .shouldPersistSdkVersion,
    ).toBe(true);
  });

  it("URL table-state params own the table on arrival", () => {
    expect(urlOwnsEventsTableState({})).toBe(false);
    expect(urlOwnsEventsTableState({ peek: "obs-1" })).toBe(false);
    expect(urlOwnsEventsTableState({ search: "x" })).toBe(true);
    expect(urlOwnsEventsTableState({ filter: "level;is;ERROR" })).toBe(true);
    expect(urlOwnsEventsTableState({ viewId: "view-1" })).toBe(true);
  });

  it("handles persisted saved-view values", () => {
    expect(storedViewOwnsEventsTableState("null")).toBe(false);
    expect(storedViewOwnsEventsTableState('"view-id"')).toBe(true);
  });

  it("suppresses only a user removal of the automatic root filter", () => {
    expect(
      getAppRootSuppressionToPersist({
        origin: "user",
        wasAutoManaged: true,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }),
    ).toBe("suppressed");
    expect(
      getAppRootSuppressionToPersist({
        origin: "saved_view",
        wasAutoManaged: true,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }),
    ).toBe(null);
    expect(
      getAppRootSuppressionToPersist({
        origin: "user",
        wasAutoManaged: false,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }),
    ).toBe(null);
  });

  it("does not treat the automatic root filter as applied saved-view state", () => {
    expect(
      getAppRootSavedViewComparisonFilters(
        [levelFilter, APP_ROOT_OBSERVATION_FILTER],
        true,
      ),
    ).toEqual([levelFilter]);
    expect(
      getAppRootSavedViewComparisonFilters(
        [levelFilter, APP_ROOT_OBSERVATION_FILTER],
        false,
      ),
    ).toEqual([levelFilter, APP_ROOT_OBSERVATION_FILTER]);
  });

  it("removes only the root filter and invalidates only a neutral recent probe", () => {
    const now = new Date("2026-07-13T12:00:00Z").getTime();
    expect(
      removeAppRootDefaultFilter([levelFilter, APP_ROOT_OBSERVATION_FILTER]),
    ).toEqual([levelFilter]);

    const fallback = (filters: FilterState, daysAgo: number) =>
      getAppRootFallbackDecision({
        additionalRowsFound: true,
        isAutoManaged: true,
        filters,
        dateRange: { from: new Date(now - daysAgo * 86_400_000) },
        now,
      }).shouldInvalidateSdkVersion;

    expect(fallback([APP_ROOT_OBSERVATION_FILTER], 1)).toBe(true);
    expect(fallback([levelFilter, APP_ROOT_OBSERVATION_FILTER], 1)).toBe(false);
    expect(fallback([APP_ROOT_OBSERVATION_FILTER], 30)).toBe(false);
  });
});
