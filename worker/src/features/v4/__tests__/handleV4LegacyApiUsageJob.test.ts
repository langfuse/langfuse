import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  v4ExperimentPostUsageProjectKey,
  v4LegacyApiHourBucketKey,
  v4LegacyApiUsageProjectKey,
  V4_LEGACY_API_USAGE_CURSOR_KEY,
  V4_LEGACY_API_USAGE_HEARTBEAT_KEY,
  V4_LEGACY_API_USAGE_LOCK_KEY,
} from "@langfuse/shared/src/server/v4/legacyApiUsage";

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
}));

const mocks = vi.hoisted(() => ({
  queryClickhouse: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", () => ({
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
}));

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
// floor(now - 7d) to the hour.
const COVERAGE_START_CLICKHOUSE = "2026-06-18 10:00:00.000";

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

  it("cold start: scans the full 7-day window once and materializes buckets, rollups, cursor, and heartbeat", async () => {
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

    // One bucket per hour in the window, empty ones included: 7*24 + 1.
    expect(bucketKeyCount()).toBe(169);
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
      experimentPostRows: [{ projectId: "project-b", count: 2 }],
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
    ).toMatchObject({ used: true });

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
    // Only the re-scanned hours were (re)written: 06:00-10:00 plus the
    // pre-existing seeded bucket.
    expect(bucketKeyCount()).toBe(6);

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
  });

  it("runs the deep re-scan for the 03:00 UTC hour", async () => {
    vi.setSystemTime(new Date("2026-06-25T03:30:00Z"));
    redisState.store.set(
      V4_LEGACY_API_USAGE_CURSOR_KEY,
      "2026-06-25T03:00:00Z",
    );

    await handleV4LegacyApiUsageJob();

    expect(mocks.queryClickhouse.mock.calls[0]?.[0].params).toMatchObject({
      fromTimestamp: "2026-06-24 03:00:00.000",
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
