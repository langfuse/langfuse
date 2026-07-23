import type { FilterState } from "@langfuse/shared";

import {
  APP_ROOT_OBSERVATION_FILTER,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootSavedViewComparisonFilters,
  getAppRootSuppressionToPersist,
  removeAppRootDefaultFilter,
  storedViewOwnsEventsTableState,
  urlOwnsEventsTableState,
} from "./appRootDefaultFilterPolicy";
import {
  getSdkVersionCapability,
  getSdkVersionCapabilityStatus,
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
  preference: null,
  defaultViewSettled: true,
  savedViewOwnsState: false,
  dismissed: false,
  now,
};

describe("app-root default policy", () => {
  it.each([
    ["javascript", "5.4.0", "supported"],
    ["javascript", "5.3.9", "unsupported"],
    ["typescript", "5.10.0", "supported"],
    ["python", "4.7.0", "supported"],
    ["python", "4.6.9", "unsupported"],
    ["python", "4.7.0rc1", "supported"],
    ["python", "4.6.9rc1", "unsupported"],
    ["javascript", "5.4.0-beta.1", "supported"],
    ["javascript", "5.3.9-beta.1", "unsupported"],
    ["custom", "1.0.0", "unknown"],
  ] as const)(
    "reports the %s %s capability status as %s",
    (name, version, expected) => {
      const sdkVersion = toSdkVersionInfo({ isOtel: true, name, version });
      expect(
        getSdkVersionCapabilityStatus(sdkVersion, "appRootObservations"),
      ).toBe(expected);
      expect(getSdkVersionCapability(sdkVersion, "appRootObservations")).toBe(
        expected === "supported",
      );
    },
  );

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
