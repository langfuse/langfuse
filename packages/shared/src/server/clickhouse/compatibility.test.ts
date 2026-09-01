import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
    CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN: "auto",
  },
}));

vi.mock("../../env", () => envMock);

import {
  resolveClickHouseJsonBadUnicodeEscapeMode,
  isClickHouseVersionInBand,
  parseClickHouseVersion,
  resolveClickHouseCompatibility,
} from "./compatibility";

const noCompatibilitySettings = {};
const disableLazyMaterialization = {
  query_plan_optimize_lazy_materialization: 0,
};
const disableTopKThroughJoin = { query_plan_top_k_through_join: 0 };

describe("ClickHouse compatibility version parsing", () => {
  it("parses and compares ClickHouse build components", () => {
    expect(parseClickHouseVersion("26.5.1.882")).toMatchObject({
      major: 26,
      minor: 5,
      patch: 1,
      build: 882,
      tuple: [26, 5, 1, 882],
    });

    const band = {
      minInclusive: "26.5.1.651",
      maxExclusive: "26.5.6.70",
    };

    expect(isClickHouseVersionInBand("26.5.1.650", band)).toBe(false);
    expect(isClickHouseVersionInBand("26.5.1.651", band)).toBe(true);
    expect(isClickHouseVersionInBand("26.5.6.69", band)).toBe(true);
    expect(isClickHouseVersionInBand("26.5.6.70", band)).toBe(false);
  });

  it("parses dotted vendor suffixes after the build component", () => {
    expect(parseClickHouseVersion("25.4.1.1.altinitystable")).toMatchObject({
      major: 25,
      minor: 4,
      patch: 1,
      build: 1,
      tuple: [25, 4, 1, 1],
    });
  });
});

describe("resolveClickHouseCompatibility", () => {
  it.each([
    // Patch-parts lower bound and upstream fix.
    ["25.3.99.9999", noCompatibilitySettings],
    ["25.4.0.0", disableLazyMaterialization],
    ["26.4.1.1005", noCompatibilitySettings],
    // Top-K introduction and the exact fix on each release line.
    ["26.5.1.650", noCompatibilitySettings],
    ["26.5.1.651", disableTopKThroughJoin],
    ["26.5.6.70", noCompatibilitySettings],
    ["26.6.0.0", disableTopKThroughJoin],
    ["26.6.2.108", noCompatibilitySettings],
    ["26.7.0.0", disableTopKThroughJoin],
    ["26.7.1.1334", noCompatibilitySettings],
    ["26.7.2.0", disableTopKThroughJoin],
    ["26.7.2.11", noCompatibilitySettings],
    ["26.7.99.9999", noCompatibilitySettings],
    ["26.8.0.0", noCompatibilitySettings],
    ["26.8.1.2041", noCompatibilitySettings],
  ])("resolves automatic settings for %s", (version, expectedSettings) => {
    expect(resolveClickHouseCompatibility({ version }).settings).toEqual(
      expectedSettings,
    );
  });

  it("reports both independently computed compatibility flags", () => {
    const resolved = resolveClickHouseCompatibility({
      version: "26.5.5.8",
    });

    expect(resolved.settings).toEqual(disableTopKThroughJoin);
    expect(resolved.flags).toEqual([
      expect.objectContaining({
        id: "disable-lazy-materialization-for-patch-parts",
        setting: "query_plan_optimize_lazy_materialization",
        matchesVersionBand: false,
        applied: false,
      }),
      expect.objectContaining({
        id: "disable-top-k-through-join",
        setting: "query_plan_top_k_through_join",
        matchesVersionBand: true,
        applied: true,
      }),
    ]);
  });

  it("applies compatibility overrides independently", () => {
    expect(
      resolveClickHouseCompatibility({
        version: "26.5.5.8",
        overrides: {
          CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "true",
          CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN: "false",
        },
      }).settings,
    ).toEqual({
      ...disableLazyMaterialization,
    });
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
