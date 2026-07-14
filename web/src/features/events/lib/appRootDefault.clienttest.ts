import type { FilterState } from "@langfuse/shared";

import {
  APP_ROOT_OBSERVATION_FILTER,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootFilterChangeDecision,
  removeAppRootDefaultFilter,
  storedViewOwnsEventsTableState,
} from "./appRootDefaultFilterPolicy";
import {
  appRootPreferenceStorageKey,
} from "./appRootDefaultStorage";
import {
  getSdkVersionCapability,
  sdkVersionStorageKeys,
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
  hasUserId: true,
  appRootSupported: getSdkVersionCapability(
    { language: "javascript", version: "5.4.0" },
    "appRootObservations",
  ),
  sdkCheckedAt: "2026-07-14T12:00:00.000Z",
  sdkCheckSettled: false,
  preference: null,
  defaultViewSettled: true,
  savedViewOwnsState: false,
  owner: "neutral" as const,
  urlOwnsState: false,
  now,
};

describe("app-root default policy", () => {
  it.each([
    ["javascript", "5.4.0", true],
    ["javascript", "5.3.9", false],
    ["typescript", "5.10.0", true],
    ["@langfuse/tracing", "5.4.0", true],
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
    [{}, true, false],
    [{ enabled: false }, false, false],
    [{ sdkCheckedAt: null }, false, true],
    [
      {
        appRootSupported: getSdkVersionCapability(
          { language: "python", version: "4.6.9" },
          "appRootObservations",
        ),
      },
      false,
      false,
    ],
    [{ preference: "suppressed" }, false, false],
    [{ owner: "url" as const }, false, false],
    [{ savedViewOwnsState: true }, false, false],
  ])("resolves table eligibility %#", (override, apply, querySdk) => {
    const policy = getAppRootDefaultPolicy({ ...basePolicy, ...override });
    expect(policy.shouldApplyFilter).toBe(apply);
    expect(policy.shouldQuerySdkVersion).toBe(querySdk);
  });

  it("tracks URL ownership while SDK capability is unknown", () => {
    expect(
      getAppRootDefaultPolicy({
        ...basePolicy,
        sdkCheckedAt: null,
        owner: "pending",
      }).owner,
    ).toBe("neutral");
    expect(
      getAppRootDefaultPolicy({
        ...basePolicy,
        sdkCheckedAt: null,
        urlOwnsState: true,
      }).owner,
    ).toBe("url");
  });

  it("handles persisted storage values", () => {
    expect(storedViewOwnsEventsTableState("null")).toBe(false);
    expect(storedViewOwnsEventsTableState('"view-id"')).toBe(true);
    expect(sdkVersionStorageKeys("project-a")).toEqual({
      language: "events-sdk-language:project-a",
      version: "events-sdk-version:project-a",
      checkedAt: "events-sdk-checkedAt:project-a",
    });
    expect(appRootPreferenceStorageKey("user-a", "project-a")).toBe(
      "events-filter-app-root-default:user-a:project-a",
    );
  });

  it("suppresses only a user removal of the automatic root filter", () => {
    const userRemoval = getAppRootFilterChangeDecision({
      origin: "user",
      wasAutoManaged: true,
      previousFilters: [APP_ROOT_OBSERVATION_FILTER],
      nextFilters: [],
    });
    expect(userRemoval).toEqual({
      owner: "user",
      preferenceToPersist: "suppressed",
    });
    expect(
      getAppRootFilterChangeDecision({
        origin: "saved_view",
        wasAutoManaged: true,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }),
    ).toEqual({ owner: "saved_view", preferenceToPersist: null });
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
