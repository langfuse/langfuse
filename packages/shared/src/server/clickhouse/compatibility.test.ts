import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
    CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "auto",
  },
}));

vi.mock("../../env", () => envMock);

import {
  isClickHouseVersionInBand,
  parseClickHouseVersion,
  resolveClickHouseCompatibility,
} from "./compatibility";

describe("ClickHouse compatibility version parsing", () => {
  it("parses ClickHouse versions with build components", () => {
    expect(parseClickHouseVersion("26.5.1.882")).toMatchObject({
      major: 26,
      minor: 5,
      patch: 1,
      tuple: [26, 5, 1],
    });
  });

  it("parses ClickHouse versions with dotted vendor suffixes", () => {
    expect(parseClickHouseVersion("25.4.1.1.altinitystable")).toMatchObject({
      major: 25,
      minor: 4,
      patch: 1,
      tuple: [25, 4, 1],
    });
  });

  it("matches inclusive lower bounds", () => {
    const band = { minInclusive: "25.4.0" };

    expect(isClickHouseVersionInBand("25.3.99", band)).toBe(false);
    expect(isClickHouseVersionInBand("25.4.0", band)).toBe(true);
    expect(isClickHouseVersionInBand("25.4.1.1234", band)).toBe(true);
    expect(isClickHouseVersionInBand("25.4.1.1.altinitystable", band)).toBe(
      true,
    );
    expect(isClickHouseVersionInBand("26.5.1.882", band)).toBe(true);
  });

  it("matches exclusive upper bounds", () => {
    const band = { minInclusive: "25.4.0", maxExclusive: "26.4.0" };

    expect(isClickHouseVersionInBand("26.3.99", band)).toBe(true);
    expect(isClickHouseVersionInBand("26.4.0", band)).toBe(false);
  });
});

describe("resolveClickHouseCompatibility", () => {
  it("applies lazy materialization workaround in auto mode for affected versions", () => {
    const resolved = resolveClickHouseCompatibility({
      version: "26.5.1.882",
      overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto" },
    });

    expect(resolved.settings).toEqual({
      query_plan_optimize_lazy_materialization: 0,
      query_plan_filter_push_down: 0,
    });
    expect(resolved.parsedVersion).toMatchObject({
      major: 26,
      minor: 5,
      patch: 1,
      tuple: [26, 5, 1],
    });
    expect(resolved.flags).toEqual([
      expect.objectContaining({
        id: "disable-lazy-materialization",
        setting: "query_plan_optimize_lazy_materialization",
        value: 0,
        override: "auto",
        matchesVersionBand: true,
        applied: true,
      }),
      expect.objectContaining({
        id: "disable-filter-push-down",
        setting: "query_plan_filter_push_down",
        value: 0,
        override: "auto",
        matchesVersionBand: true,
        applied: true,
      }),
    ]);
  });

  it("does not apply lazy materialization workaround in auto mode before the affected band", () => {
    const resolved = resolveClickHouseCompatibility({
      version: "25.3.99",
      overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto" },
    });

    expect(resolved.settings).toEqual({});
    expect(resolved.flags).toEqual([
      expect.objectContaining({
        id: "disable-lazy-materialization",
        override: "auto",
        matchesVersionBand: false,
        applied: false,
      }),
      expect.objectContaining({
        id: "disable-filter-push-down",
        override: "auto",
        matchesVersionBand: false,
        applied: false,
      }),
    ]);
  });

  it("allows forcing lazy materialization workaround on", () => {
    expect(
      resolveClickHouseCompatibility({
        version: null,
        overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "true" },
      }).settings,
    ).toEqual({ query_plan_optimize_lazy_materialization: 0 });
  });

  it("allows forcing lazy materialization workaround off", () => {
    expect(
      resolveClickHouseCompatibility({
        version: "26.5.1.882",
        overrides: {
          CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "false",
          CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "false",
        },
      }).settings,
    ).toEqual({});
  });

  it("applies filter push down workaround in auto mode for 26.5+", () => {
    const resolved = resolveClickHouseCompatibility({
      version: "26.6.1.1193",
      overrides: { CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "auto" },
    });

    expect(resolved.settings).toMatchObject({
      query_plan_filter_push_down: 0,
    });
    expect(resolved.flags).toContainEqual(
      expect.objectContaining({
        id: "disable-filter-push-down",
        setting: "query_plan_filter_push_down",
        value: 0,
        override: "auto",
        matchesVersionBand: true,
        applied: true,
      }),
    );
  });

  it("does not apply filter push down workaround in auto mode before 26.5", () => {
    expect(
      resolveClickHouseCompatibility({
        version: "26.4.5.143",
        overrides: { CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "auto" },
      }).settings,
    ).not.toHaveProperty("query_plan_filter_push_down");
  });

  it("allows forcing filter push down workaround on", () => {
    expect(
      resolveClickHouseCompatibility({
        version: null,
        overrides: { CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "true" },
      }).settings,
    ).toMatchObject({ query_plan_filter_push_down: 0 });
  });

  it("allows forcing filter push down workaround off", () => {
    expect(
      resolveClickHouseCompatibility({
        version: "26.6.1.1193",
        overrides: { CLICKHOUSE_DISABLE_FILTER_PUSH_DOWN: "false" },
      }).settings,
    ).not.toHaveProperty("query_plan_filter_push_down");
  });
});
