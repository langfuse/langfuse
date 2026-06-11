import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
  },
}));

vi.mock("../../env", () => envMock);
vi.mock("../logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

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
    expect(
      resolveClickHouseCompatibility({
        version: "26.5.1.882",
        overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto" },
      }).settings,
    ).toEqual({ query_plan_optimize_lazy_materialization: 0 });
  });

  it("does not apply lazy materialization workaround in auto mode before the affected band", () => {
    expect(
      resolveClickHouseCompatibility({
        version: "25.3.99",
        overrides: { CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto" },
      }).settings,
    ).toEqual({});
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
