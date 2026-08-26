import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
  },
}));

vi.mock("../../env", () => envMock);

import {
  resolveClickHouseJsonBadUnicodeEscapeMode,
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
        overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "false" },
      }).settings,
    ).toEqual({});
  });
});

describe("resolveClickHouseJsonBadUnicodeEscapeMode", () => {
  it.each([
    ["24.3.0.0", undefined, "v3.225.4", "sanitize"],
    ["24.4.0.0", "auto", "v3.225.4", "no_throw"],
    [null, "auto", "v3.225.4", "sanitize"],
    ["24.3.0.0", "no_throw", "v3.225.4", "no_throw"],
    ["25.12.0.0", "sanitize", "v4.17.0", "sanitize"],
    ["24.3.0.0", undefined, "v4.17.0", "no_throw"],
  ] as const)(
    "resolves %s / %s / %s to %s",
    (version, configuredMode, applicationVersion, expected) => {
      expect(
        resolveClickHouseJsonBadUnicodeEscapeMode({
          version,
          configuredMode,
          applicationVersion,
        }),
      ).toBe(expected);
    },
  );
});
