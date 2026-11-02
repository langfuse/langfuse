import { describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    CLICKHOUSE_DISABLE_LAZY_MATERIALIZATION: "auto",
    CLICKHOUSE_DISABLE_TOP_K_THROUGH_JOIN: "auto",
    CLICKHOUSE_ENABLE_SKIP_INDEXES_ON_DATA_READ: "auto",
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
const enableSkipIndexesOnDataRead = { use_skip_indexes_on_data_read: 1 };

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
    ["26.4.1.1005", enableSkipIndexesOnDataRead],
    // Read-time skip-index evaluation, from the release that fixes the
    // patch-part read. It must stay off on 25.12, the Langfuse v4 minimum,
    // where it breaks reads of lightweight-update patch parts.
    ["25.12.11.4", disableLazyMaterialization],
    ["26.1.99.9999", disableLazyMaterialization],
    [
      "26.2.0.0",
      { ...disableLazyMaterialization, ...enableSkipIndexesOnDataRead },
    ],
    // Top-K introduction and the exact fix on each release line.
    ["26.5.1.650", enableSkipIndexesOnDataRead],
    [
      "26.5.1.651",
      { ...disableTopKThroughJoin, ...enableSkipIndexesOnDataRead },
    ],
    ["26.5.6.70", enableSkipIndexesOnDataRead],
    ["26.6.0.0", { ...disableTopKThroughJoin, ...enableSkipIndexesOnDataRead }],
    ["26.6.2.108", enableSkipIndexesOnDataRead],
    ["26.7.0.0", { ...disableTopKThroughJoin, ...enableSkipIndexesOnDataRead }],
    ["26.7.1.1334", enableSkipIndexesOnDataRead],
    ["26.7.2.0", { ...disableTopKThroughJoin, ...enableSkipIndexesOnDataRead }],
    ["26.7.2.11", enableSkipIndexesOnDataRead],
    ["26.7.99.9999", enableSkipIndexesOnDataRead],
    ["26.8.0.0", enableSkipIndexesOnDataRead],
    ["26.8.1.2041", enableSkipIndexesOnDataRead],
  ])("resolves automatic settings for %s", (version, expectedSettings) => {
    expect(resolveClickHouseCompatibility({ version }).settings).toEqual(
      expectedSettings,
    );
  });

  it("reports each independently computed compatibility flag", () => {
    const resolved = resolveClickHouseCompatibility({
      version: "26.5.5.8",
    });

    expect(resolved.settings).toEqual({
      ...disableTopKThroughJoin,
      ...enableSkipIndexesOnDataRead,
    });
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
      expect.objectContaining({
        id: "enable-skip-indexes-on-data-read",
        setting: "use_skip_indexes_on_data_read",
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
      ...enableSkipIndexesOnDataRead,
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
