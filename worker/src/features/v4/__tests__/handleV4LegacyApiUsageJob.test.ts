import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  listV4LegacyApiHourStarts,
  v4ExperimentPostUsageProjectKey,
  v4LegacyApiHourBucketKey,
  v4LegacyApiUsageProjectKey,
  V4_LEGACY_API_ROLLUP_PROJECTS_KEY,
  V4_LEGACY_API_USAGE_CURSOR_KEY,
  V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY,
  V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
  V4_LEGACY_API_USAGE_LOCK_KEY,
} from "@langfuse/shared/src/server";

/**
 * In-memory Redis fake covering the commands used by the handler and
 * RedisLock: get/set(NX)/setex/mget/eval(check-and-delete).
 */
const redisState = vi.hoisted(() => ({
  store: new Map<string, string>(),
}));

const redisMock = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisState.store.get(key) ?? null),
  set: vi.fn(
    async (
      key: string,
      value: string,
      _ex?: string,
      _ttl?: number,
      nx?: string,
    ) => {
      if (nx === "NX" && redisState.store.has(key)) return null;
      redisState.store.set(key, value);
      return "OK";
    },
  ),
  setex: vi.fn(async (key: string, _ttl: number, value: string) => {
    redisState.store.set(key, value);
    return "OK";
  }),
  mget: vi.fn(async (keys: string[]) =>
    keys.map((key) => redisState.store.get(key) ?? null),
  ),
  eval: vi.fn(async (_script: string, _numKeys: number, ...args: string[]) => {
    const [key, value] = args;
    if (redisState.store.get(key) === value) {
      redisState.store.delete(key);
      return 1;
    }
    return 0;
  }),
  del: vi.fn(async (...args: Array<string | string[]>) => {
    // Mirror ioredis: del(...keys) and del(keys[]) are both valid.
    const keys = args.flat();
    let deleted = 0;
    for (const key of keys) {
      if (redisState.store.delete(key)) deleted += 1;
    }
    return deleted;
  }),
}));

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...original,
    redis: redisMock,
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    queryClickhouse: mocks.queryClickhouse,
    systemTableRef: (table: string) =>
      `clusterAllReplicas('test-cluster', '${table}')`,
    convertDateToClickhouseDateTime: (date: Date) =>
      date.toISOString().replace("T", " ").replace("Z", ""),
  };
});

vi.mock("@langfuse/shared/src/env", () => ({
  env: {
    CLICKHOUSE_URL: "https://clickhouse-main.example.com",
    CLICKHOUSE_READ_ONLY_URL: "https://clickhouse-read.example.com",
    CLICKHOUSE_EVENTS_READ_ONLY_URL: undefined,
  },
}));

import { handleV4LegacyApiUsageJob } from "../handleV4LegacyApiUsageJob";

// 10:30 UTC: a regular run (the deep re-scan happens at 03:xx UTC only).
const TEST_NOW = new Date("2026-06-25T10:30:00Z");
const CURRENT_HOUR_ISO = "2026-06-25T10:00:00Z";
// floor(now - 14d) to the hour.
const COVERAGE_START_CLICKHOUSE = "2026-06-11 10:00:00.000";

const usageRow = (overrides: {
  hourStart?: string;
  projectId?: string;
  route?: string;
  count?: string | number;
  lastSeen?: string;
}) => ({
  hourStart: overrides.hourStart ?? "2026-06-25T09:00:00Z",
  projectId: overrides.projectId ?? "project-a",
  route: overrides.route ?? "GET /api/public/traces",
  count: overrides.count ?? "4",
  lastSeen: overrides.lastSeen ?? "2026-06-25T09:15:00.000000Z",
});

const readJson = (key: string): unknown => {
  const value = redisState.store.get(key);
  return value ? JSON.parse(value) : null;
};

const emptyBucket = () =>
  JSON.stringify({
    version: 1,
    computedAt: "2026-06-24T00:00:00.000Z",
    apiRows: [],
    experimentPostRows: [],
  });

/** Seeds a valid (empty) bucket for every hour of the trailing window. */
const seedCoverageBuckets = (skipHourIsos: string[] = []) => {
  const skip = new Set(skipHourIsos.map((iso) => Date.parse(iso)));
  for (const hourStartMs of listV4LegacyApiHourStarts(
    Date.parse("2026-06-11T10:00:00Z"),
    Date.parse(CURRENT_HOUR_ISO),
  )) {
    if (skip.has(hourStartMs)) continue;
    redisState.store.set(v4LegacyApiHourBucketKey(hourStartMs), emptyBucket());
  }
};

/** Marks the deep re-scan as recently done so runs use the 3h margin. */
const seedRecentDeepRescan = () => {
  redisState.store.set(
    V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY,
    "2026-06-25T05:00:00.000Z",
  );
};

const bucketKeyCount = (): number =>
  Array.from(redisState.store.keys()).filter((key) =>
    key.startsWith("langfuse:v4:legacy-api-usage:hour:v1:"),
  ).length;

describe("handleV4LegacyApiUsageJob", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TEST_NOW);
    redisState.store.clear();
    mocks.queryClickhouse.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("cold start: scans the full 14-day window once and materializes buckets, rollups, cursor, and heartbeat", async () => {
    const rows = [
      usageRow({}),
      usageRow({
        hourStart: CURRENT_HOUR_ISO,
        projectId: "project-b",
        route: "POST /api/public/dataset-run-items",
        count: "2",
        lastSeen: "2026-06-25T10:05:00.000000Z",
      }),
    ];
    // Both services return identical result sets (overlapping replicas):
    // they must be deduplicated, not summed.
    mocks.queryClickhouse.mockResolvedValue(rows);

    await handleV4LegacyApiUsageJob();

    expect(mocks.queryClickhouse).toHaveBeenCalledTimes(2);
    const services = mocks.queryClickhouse.mock.calls.map(
      ([args]) => args.preferredClickhouseService,
    );
    expect(services).toEqual(["ReadWrite", "ReadOnly"]);
    expect(mocks.queryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      fromTimestamp: COVERAGE_START_CLICKHOUSE,
      toTimestamp: "2026-06-25 10:30:00.000",
    });
    expect(mocks.queryClickhouse.mock.calls[0]?.[0].query).toContain(
      "toStartOfHour(event_time, 'UTC')",
    );

    // One bucket per hour in the window, empty ones included: 14*24 + 1.
    expect(bucketKeyCount()).toBe(337);
    expect(
      readJson(v4LegacyApiHourBucketKey(Date.parse("2026-06-25T09:00:00Z"))),
    ).toMatchObject({
      version: 1,
      apiRows: [
        {
          projectId: "project-a",
          entrypoint: "publicapi: GET /api/public/traces",
          count: 4,
          lastSeen: "2026-06-25T09:15:00.000000Z",
        },
      ],
      experimentPostRows: [],
    });
    expect(
      readJson(v4LegacyApiHourBucketKey(Date.parse(CURRENT_HOUR_ISO))),
    ).toMatchObject({
      apiRows: [],
      experimentPostRows: [
        {
          projectId: "project-b",
          count: 2,
          lastSeen: "2026-06-25T10:05:00.000000Z",
        },
      ],
    });

    // Consumer-facing entries: identical service sets deduplicated (count 4,
    // not 8); POST usage becomes an experiment entry, not an API row.
    expect(readJson(v4LegacyApiUsageProjectKey("project-a"))).toMatchObject({
      version: 1,
      rows: [
        {
          entrypoint: "publicapi: GET /api/public/traces",
          count: 4,
          lastSeen: "2026-06-25T09:15:00.000000Z",
        },
      ],
    });
    expect(readJson(v4LegacyApiUsageProjectKey("project-b"))).toBeNull();
    expect(
      readJson(v4ExperimentPostUsageProjectKey("project-b")),
    ).toMatchObject({
      used: true,
      lastSeen: "2026-06-25T10:05:00.000000Z",
    });

    expect(redisState.store.get(V4_LEGACY_API_USAGE_CURSOR_KEY)).toBe(
      CURRENT_HOUR_ISO,
    );
    expect(redisState.store.get(V4_LEGACY_API_USAGE_HEARTBEAT_KEY)).toBe(
      TEST_NOW.toISOString(),
    );
    // Lock released after the run.
    expect(redisState.store.has(V4_LEGACY_API_USAGE_LOCK_KEY)).toBe(false);
  });

  it("incremental run: re-scans only the trailing margin and merges with existing buckets", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T09:00:00Z",
    );
    seedRecentDeepRescan();
    seedCoverageBuckets();
    // Existing bucket from an earlier run, outside the re-scan range: its
    // counts must survive and merge into the rollup.
    redisState.store.set(
      v4LegacyApiHourBucketKey(Date.parse("2026-06-20T00:00:00Z")),
      JSON.stringify({
        version: 1,
        computedAt: "2026-06-20T01:00:00.000Z",
        apiRows: [
          {
            projectId: "project-a",
            entrypoint: "publicapi: GET /api/public/traces",
            count: 2,
            lastSeen: "2026-06-20T00:30:00.000000Z",
          },
        ],
        experimentPostRows: [],
      }),
    );
    // Distinct result sets across services are summed per row key.
    mocks.queryClickhouse
      .mockResolvedValueOnce([usageRow({ count: "4" })])
      .mockResolvedValueOnce([
        usageRow({ count: "1", lastSeen: "2026-06-25T09:20:00.000000Z" }),
      ]);

    await handleV4LegacyApiUsageJob();

    // Cursor 09:00 minus the 3h margin.
    expect(mocks.queryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      fromTimestamp: "2026-06-25 06:00:00.000",
    });

    expect(readJson(v4LegacyApiUsageProjectKey("project-a"))).toMatchObject({
      rows: [
        {
          entrypoint: "publicapi: GET /api/public/traces",
          // 2 (old bucket) + 4 + 1 (distinct service results summed).
          count: 7,
          lastSeen: "2026-06-25T09:20:00.000000Z",
        },
      ],
    });
    expect(readJson(V4_LEGACY_API_ROLLUP_PROJECTS_KEY)).toEqual({
      version: 1,
      api: ["project-a"],
      experimentPost: [],
    });
  });

  it("runs the deep re-scan when none happened within the last 24 hours", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T09:00:00Z",
    );
    seedCoverageBuckets();
    // Last deep re-scan 25h ago: due again, regardless of wall-clock hour.
    redisState.store.set(
      V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY,
      "2026-06-24T09:30:00.000Z",
    );

    await handleV4LegacyApiUsageJob();

    // Cursor 09:00 minus the 24h deep margin.
    expect(mocks.queryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      fromTimestamp: "2026-06-24 09:00:00.000",
    });
    expect(redisState.store.get(V4_LEGACY_API_USAGE_DEEP_RESCAN_AT_KEY)).toBe(
      TEST_NOW.toISOString(),
    );
  });

  it("extends the scan to repair missing or corrupt buckets inside the window", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T09:00:00Z",
    );
    seedRecentDeepRescan();
    // One bucket is missing well before the cursor margin; without repair the
    // rollup would silently lose that hour while the heartbeat stays fresh.
    seedCoverageBuckets(["2026-06-21T05:00:00Z"]);

    await handleV4LegacyApiUsageJob();

    expect(mocks.queryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      fromTimestamp: "2026-06-21 05:00:00.000",
    });
    expect(
      redisState.store.has(
        v4LegacyApiHourBucketKey(Date.parse("2026-06-21T05:00:00Z")),
      ),
    ).toBe(true);
  });

  it("deletes per-project entries for projects that dropped out of the window", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T09:00:00Z",
    );
    seedRecentDeepRescan();
    seedCoverageBuckets();
    // Entries and tracking state from a previous run whose usage has aged out.
    redisState.store.set(
      V4_LEGACY_API_ROLLUP_PROJECTS_KEY,
      JSON.stringify({
        version: 1,
        api: ["project-gone"],
        experimentPost: ["project-post-gone"],
      }),
    );
    redisState.store.set(
      v4LegacyApiUsageProjectKey("project-gone"),
      JSON.stringify({ version: 1, computedAt: "old", rows: [] }),
    );
    redisState.store.set(
      v4ExperimentPostUsageProjectKey("project-post-gone"),
      JSON.stringify({
        version: 1,
        computedAt: "old",
        used: true,
        lastSeen: "2026-06-10T00:00:00.000000Z",
      }),
    );

    await handleV4LegacyApiUsageJob();

    expect(
      redisState.store.has(v4LegacyApiUsageProjectKey("project-gone")),
    ).toBe(false);
    expect(
      redisState.store.has(
        v4ExperimentPostUsageProjectKey("project-post-gone"),
      ),
    ).toBe(false);
    expect(readJson(V4_LEGACY_API_ROLLUP_PROJECTS_KEY)).toEqual({
      version: 1,
      api: [],
      experimentPost: [],
    });
  });

  it("skips the run when another worker holds the lock", async () => {
    redisState.store.set(V4_LEGACY_API_USAGE_LOCK_KEY, "someone-else");

    await handleV4LegacyApiUsageJob();

    expect(mocks.queryClickhouse).not.toHaveBeenCalled();
    expect(redisState.store.has(V4_LEGACY_API_USAGE_CURSOR_KEY)).toBe(false);
  });

  it("throws and leaves the cursor untouched when a service scan fails", async () => {
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T09:00:00Z",
    );
    mocks.queryClickhouse
      .mockResolvedValueOnce([usageRow({})])
      .mockRejectedValueOnce(new Error("query_log unavailable"));

    await expect(handleV4LegacyApiUsageJob()).rejects.toThrow(
      "query_log unavailable",
    );

    expect(redisState.store.get(V4_LEGACY_API_USAGE_CURSOR_KEY)).toBe(
      "2026-06-25T09:00:00Z",
    );
    expect(redisState.store.has(V4_LEGACY_API_USAGE_HEARTBEAT_KEY)).toBe(false);
    // Lock still released on failure.
    expect(redisState.store.has(V4_LEGACY_API_USAGE_LOCK_KEY)).toBe(false);
  });
});
