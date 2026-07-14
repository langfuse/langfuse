import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import {
  APP_ROOT_OBSERVATION_FILTER,
  getAppRootDefaultPolicy,
  getAppRootFallbackDecision,
  getAppRootFilterChangeDecision,
  removeAppRootDefaultFilter,
  supportsAppRootFiltering,
} from "./appRootDefaultPolicy";
import {
  appRootCapabilityStorageKey,
  appRootPreferenceStorageKey,
} from "./appRootDefaultStorage";

const levelFilter: FilterState[number] = {
  column: "level",
  type: "stringOptions",
  operator: "any of",
  value: ["ERROR"],
};

const neutralPolicyInput = {
  enabled: true,
  routerReady: true,
  hasUserId: true,
  cachedCapability: "supported",
  preference: null,
  defaultViewSettled: true,
  savedViewOwnsState: false,
  currentViewOwnsState: false,
  owner: "neutral" as const,
  urlOwnsState: false,
};

describe("app-root table default", () => {
  it.each([
    ["javascript", "5.4.0", true],
    ["javascript", "5.10.0", true],
    ["javascript", "5.3.9", false],
    ["typescript", "5.4.0", true],
    ["@langfuse/tracing", "5.4.0", true],
    ["python", "4.7.0", true],
    ["python", "4.6.9", false],
    ["python", "4.7.0rc1", false],
    ["unknown", "99.0.0", false],
    ["javascript", "99999999999999999999.0.0", false],
  ])("recognizes %s %s support", (name, version, expected) => {
    expect(supportsAppRootFiltering({ isOtel: true, name, version })).toBe(
      expected,
    );
  });

  it("scopes capability by project and preference by user and project", () => {
    expect(appRootCapabilityStorageKey("project-a")).toBe(
      "events-app-root-capability:v1:project-a",
    );
    expect(appRootPreferenceStorageKey("user-a", "project-a")).toBe(
      "events-app-root-default:v1:user-a:project-a",
    );
  });

  it("applies only on an eligible neutral table", () => {
    expect(getAppRootDefaultPolicy(neutralPolicyInput).shouldApplyFilter).toBe(
      true,
    );
    expect(
      getAppRootDefaultPolicy({ ...neutralPolicyInput, enabled: false })
        .shouldApplyFilter,
    ).toBe(false);
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        cachedCapability: null,
      }).shouldApplyFilter,
    ).toBe(false);
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        preference: "suppressed",
      }).shouldApplyFilter,
    ).toBe(false);
    expect(
      getAppRootDefaultPolicy({ ...neutralPolicyInput, owner: "url" })
        .shouldApplyFilter,
    ).toBe(false);
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        savedViewOwnsState: true,
      }).shouldApplyFilter,
    ).toBe(false);
  });

  it("tracks table ownership with one explicit state", () => {
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        cachedCapability: null,
        owner: "pending",
        urlOwnsState: false,
      }).owner,
    ).toBe("neutral");
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        cachedCapability: null,
        owner: "neutral",
        urlOwnsState: true,
      }).owner,
    ).toBe("url");
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        owner: "neutral",
        urlOwnsState: true,
      }).owner,
    ).toBe("neutral");
  });

  it("queries SDK capability only while it is unknown and useful", () => {
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        cachedCapability: null,
      }).shouldQueryCapability,
    ).toBe(true);
    expect(
      getAppRootDefaultPolicy(neutralPolicyInput).shouldQueryCapability,
    ).toBe(false);
    expect(
      getAppRootDefaultPolicy({
        ...neutralPolicyInput,
        cachedCapability: null,
        owner: "fallback",
      }).shouldQueryCapability,
    ).toBe(false);
  });

  it("removes only the root filter", () => {
    expect(
      removeAppRootDefaultFilter([levelFilter, APP_ROOT_OBSERVATION_FILTER]),
    ).toEqual([levelFilter]);
  });

  it("suppresses only after a user removes or disables an auto-managed root", () => {
    expect(
      getAppRootFilterChangeDecision({
        origin: "user",
        wasAutoManaged: true,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }).preferenceToPersist,
    ).toBe("suppressed");

    expect(
      getAppRootFilterChangeDecision({
        origin: "saved_view",
        wasAutoManaged: true,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }),
    ).toEqual({ owner: "saved_view", preferenceToPersist: null });

    expect(
      getAppRootFilterChangeDecision({
        origin: "user",
        wasAutoManaged: false,
        previousFilters: [APP_ROOT_OBSERVATION_FILTER],
        nextFilters: [],
      }).preferenceToPersist,
    ).toBeNull();
  });

  it("invalidates capability only for a neutral recent fallback", () => {
    const now = new Date("2026-07-13T12:00:00Z").getTime();
    const recent = {
      from: new Date(now - 24 * 60 * 60 * 1000),
      to: new Date(now),
    };

    expect(
      getAppRootFallbackDecision({
        additionalRowsFound: true,
        isAutoManaged: true,
        filters: [APP_ROOT_OBSERVATION_FILTER],
        dateRange: recent,
        now,
      }).shouldInvalidateCapability,
    ).toBe(true);
    expect(
      getAppRootFallbackDecision({
        additionalRowsFound: true,
        isAutoManaged: true,
        filters: [levelFilter, APP_ROOT_OBSERVATION_FILTER],
        dateRange: recent,
        now,
      }).shouldInvalidateCapability,
    ).toBe(false);
    expect(
      getAppRootFallbackDecision({
        additionalRowsFound: true,
        isAutoManaged: true,
        filters: [APP_ROOT_OBSERVATION_FILTER],
        dateRange: {
          from: new Date(now - 30 * 24 * 60 * 60 * 1000),
          to: new Date(now - 20 * 24 * 60 * 60 * 1000),
        },
        now,
      }).shouldInvalidateCapability,
    ).toBe(false);
  });
});
