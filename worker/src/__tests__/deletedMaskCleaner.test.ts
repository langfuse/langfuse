import { randomUUID } from "crypto";
import {
  afterEach,
  describe,
  expect,
  it,
  beforeEach,
  type TestContext,
} from "vitest";
import {
  commandClickhouse,
  createEvent,
  createEventsCh,
  queryClickhouse,
  redis,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import {
  DELETED_MASK_CLEANER_LOCK_KEY,
  DeletedMaskCleaner,
} from "../features/deleted-mask-cleaner";
import {
  buildApplyDeletedMaskQuery,
  buildMutationCountQuery,
  normalizeMutationCounts,
  selectCandidateToProcess,
  shouldUseDeletedMaskCleanerClusterMode,
  type MutationCountRow,
  type WorkCandidateRow,
} from "../features/deleted-mask-cleaner/helpers";
import { skipUnlessClickhouseTablesExist } from "./helpers/clickhouseTables";

const TEST_TABLE = "events_full" as const;
const PATCH_WAIT_TIMEOUT_MS = 30_000;
const PATCH_CLEAN_TIMEOUT_MS = 60_000;

async function skipUnlessEventsTableEnabled(ctx: TestContext): Promise<void> {
  await skipUnlessClickhouseTablesExist(
    ctx,
    [TEST_TABLE],
    "events table is not enabled in this ClickHouse",
  );

  if (!redis) {
    ctx.skip(
      "Redis must be available for DeletedMaskCleaner integration tests",
    );
  }
}

async function eventually<T>(
  getValue: () => Promise<T>,
  predicate: (value: T) => boolean,
  message: string,
  timeoutMs: number = PATCH_WAIT_TIMEOUT_MS,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastValue: T | undefined;

  while (Date.now() < deadline) {
    lastValue = await getValue();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${message}. Last value: ${JSON.stringify(lastValue)}`);
}

function getRandomPastMonthPartition(): string {
  const randomValue = Number.parseInt(randomUUID().slice(0, 8), 16);
  const year = 2010 + (randomValue % 15);
  const month = Math.floor(randomValue / 15) % 12;

  return `${year}${String(month + 1).padStart(2, "0")}`;
}

function getTimestampForMonthPartition(partition: string): number {
  const year = Number(partition.slice(0, 4));
  const zeroBasedMonth = Number(partition.slice(4, 6)) - 1;

  return Date.UTC(year, zeroBasedMonth, 15, 12, 0, 0);
}

function workCandidate(
  overrides: Partial<WorkCandidateRow> = {},
): WorkCandidateRow {
  return {
    partition: "patch-a-202405",
    table: "scores",
    partition_to_clean: "202405",
    total_rows: 10,
    ...overrides,
  };
}

/**
 * Rows of the largest active patch partition on the table. The cleaner picks
 * the largest candidate per table, so a test partition with more rows than
 * this is guaranteed to be processed first, whatever other tests left behind.
 */
async function largestCandidateRows(): Promise<number> {
  const rows = await queryClickhouse<{ total_rows: string }>({
    query: `
      SELECT sum(rows) AS total_rows
      FROM system.parts
      WHERE table = {table: String}
        AND database = {database: String}
        AND startsWith(partition, 'patch-')
        AND active = 1
      GROUP BY partition
      ORDER BY total_rows DESC
      LIMIT 1
    `,
    params: {
      table: TEST_TABLE,
      database: env.CLICKHOUSE_DB,
    },
  });

  return Number(rows[0]?.total_rows ?? 0);
}

async function hasActivePatchPart(partitionToClean: string): Promise<boolean> {
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count() AS count
      FROM system.parts
      WHERE table = {table: String}
        AND database = {database: String}
        AND startsWith(partition, 'patch-')
        AND splitByString('-', partition)[3] = {partitionToClean: String}
        AND active = 1
    `,
    params: {
      table: TEST_TABLE,
      database: env.CLICKHOUSE_DB,
      partitionToClean,
    },
  });

  return Number(rows[0]?.count ?? 0) > 0;
}

async function waitForCleanerCandidate(
  partitionToClean: string,
): Promise<void> {
  await eventually(
    () => hasActivePatchPart(partitionToClean),
    (hasCandidate) => hasCandidate,
    `Timed out waiting for ClickHouse patch part ${partitionToClean}`,
  );
}

/**
 * Rows of a project that are physically present, ignoring lightweight-delete
 * patch parts. APPLY DELETED MASK materialises the deletion and brings this to
 * zero as soon as its mutation finishes. The patch parts themselves stay
 * listed as active until ClickHouse's background housekeeping removes them,
 * which can take minutes, so they are not a usable completion signal.
 */
async function countPhysicalRows(projectId: string): Promise<number> {
  const rows = await queryClickhouse<{ count: string }>({
    query: `
      SELECT count() AS count
      FROM ${TEST_TABLE}
      WHERE project_id = {projectId: String}
      SETTINGS apply_patch_parts = 0
    `,
    params: { projectId },
  });

  return Number(rows[0]?.count ?? 0);
}

async function waitForDeletionMaterialised(projectId: string): Promise<void> {
  await eventually(
    () => countPhysicalRows(projectId),
    (count) => count === 0,
    `Timed out waiting for the deleted rows of project ${projectId} to be removed from ${TEST_TABLE}`,
    PATCH_CLEAN_TIMEOUT_MS,
  );
}

async function getActiveMutationCount(
  table: string = TEST_TABLE,
): Promise<number> {
  const rows = await queryClickhouse<MutationCountRow>({
    query: buildMutationCountQuery(
      shouldUseDeletedMaskCleanerClusterMode({
        clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
        cleanerClusterModeEnabled:
          env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_CLUSTER_MODE_ENABLED ===
          "true",
      }),
      env.CLICKHOUSE_CLUSTER_NAME,
    ),
    params: {
      database: env.CLICKHOUSE_DB,
      tables: [table],
    },
  });

  return Number(rows[0]?.mutation_count ?? 0);
}

async function waitForNoActiveMutations(
  table: string = TEST_TABLE,
): Promise<void> {
  await eventually(
    () => getActiveMutationCount(table),
    (mutationCount) => mutationCount === 0,
    `Timed out waiting for ClickHouse mutations to finish on ${table}`,
    PATCH_CLEAN_TIMEOUT_MS,
  );
}

function cleanerDdlConfig() {
  return {
    database: env.CLICKHOUSE_DB,
    clusterEnabled: shouldUseDeletedMaskCleanerClusterMode({
      clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
      cleanerClusterModeEnabled:
        env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_CLUSTER_MODE_ENABLED ===
        "true",
    }),
    clusterName: env.CLICKHOUSE_CLUSTER_NAME,
  };
}

async function applyDeletedMask(candidate: WorkCandidateRow): Promise<void> {
  await commandClickhouse({
    query: buildApplyDeletedMaskQuery(candidate, cleanerDdlConfig()),
    clickhouseSettings: {
      mutations_sync: "2",
    },
  });

  await waitForNoActiveMutations(candidate.table);
}

async function createEventPatchParts(
  partitions: Array<{
    partition: string;
    timestamp: number;
    rows: number;
  }>,
): Promise<string> {
  const projectId = randomUUID();

  await createEventsCh(
    partitions.flatMap(({ timestamp, rows, partition }) =>
      Array.from({ length: rows }, () =>
        createEvent({
          project_id: projectId,
          trace_id: randomUUID(),
          span_id: randomUUID(),
          name: `deleted-mask-cleaner-${partition}`,
          start_time: timestamp,
          end_time: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
          event_ts: timestamp,
        }),
      ),
    ),
  );

  await commandClickhouse({
    query: `DELETE FROM ${TEST_TABLE} WHERE project_id = {projectId: String}`,
    params: { projectId },
    clickhouseSettings: {
      lightweight_delete_mode: "lightweight_update_force",
      update_parallel_mode: "sync",
      lightweight_deletes_sync: 2,
    },
  });

  for (const { partition } of partitions) {
    await waitForCleanerCandidate(partition);
  }

  return projectId;
}

describe("DeletedMaskCleaner helpers", () => {
  it("normalizes missing mutation rows to zero counts", () => {
    expect(
      normalizeMutationCounts(
        ["traces", "scores"],
        [{ table: "traces", mutation_count: "3" }],
      ),
    ).toEqual(
      new Map([
        ["traces", 3],
        ["scores", 0],
      ]),
    );
  });

  it("uses cleaner cluster mode only when ClickHouse cluster mode and the explicit cleaner flag are enabled", () => {
    expect(
      shouldUseDeletedMaskCleanerClusterMode({
        clusterEnabled: true,
        cleanerClusterModeEnabled: true,
      }),
    ).toBe(true);
    expect(
      shouldUseDeletedMaskCleanerClusterMode({
        clusterEnabled: true,
        cleanerClusterModeEnabled: false,
      }),
    ).toBe(false);
    expect(
      shouldUseDeletedMaskCleanerClusterMode({
        clusterEnabled: false,
        cleanerClusterModeEnabled: true,
      }),
    ).toBe(false);

    expect(buildMutationCountQuery(true, "default")).toContain(
      "clusterAllReplicas",
    );
    expect(buildMutationCountQuery(false, "default")).toContain(
      "FROM system.mutations",
    );
  });

  it("selects the first candidate without active table mutations", () => {
    const candidates: WorkCandidateRow[] = [
      workCandidate({
        table: "traces",
        total_rows: 10,
      }),
      workCandidate({
        partition: "patch-b-202404",
        partition_to_clean: "202404",
        total_rows: 5,
      }),
    ];

    const selection = selectCandidateToProcess(
      candidates,
      new Map([
        ["traces", 1],
        ["scores", 0],
      ]),
    );

    expect(selection.candidate).toEqual(candidates[1]);
    expect(selection.skipped).toEqual([
      { candidate: candidates[0], mutationCount: 1 },
    ]);
  });

  it("returns no candidate when all target tables have active mutations", () => {
    const candidate = workCandidate();

    expect(
      selectCandidateToProcess([candidate], new Map([["scores", 2]])).candidate,
    ).toBeNull();
  });

  it("builds clustered and unclustered APPLY DELETED MASK statements", () => {
    const candidate = workCandidate({
      table: "observations",
    });

    expect(
      buildApplyDeletedMaskQuery(candidate, {
        database: "default",
        clusterEnabled: false,
      }),
    ).toBe(
      "ALTER TABLE `default`.`observations` APPLY DELETED MASK IN PARTITION '202405'",
    );
    expect(
      buildApplyDeletedMaskQuery(candidate, {
        database: "default",
        clusterEnabled: true,
        clusterName: "default",
      }),
    ).toBe(
      "ALTER TABLE `default`.`observations` ON CLUSTER `default` APPLY DELETED MASK IN PARTITION '202405'",
    );
  });

  it("quotes ClickHouse DDL identifiers with non-bare identifier characters", () => {
    expect(
      buildApplyDeletedMaskQuery(workCandidate({ table: "events_full" }), {
        database: "langfuse-prod",
        clusterEnabled: true,
        clusterName: "prod-cluster",
      }),
    ).toBe(
      "ALTER TABLE `langfuse-prod`.`events_full` ON CLUSTER `prod-cluster` APPLY DELETED MASK IN PARTITION '202405'",
    );
  });

  it("rejects empty DDL identifiers and unsafe partition ids", () => {
    const candidate = workCandidate();

    expect(() =>
      buildApplyDeletedMaskQuery(candidate, {
        database: "",
        clusterEnabled: false,
      }),
    ).toThrow("Invalid ClickHouse database");
    expect(() =>
      buildApplyDeletedMaskQuery(
        {
          ...candidate,
          partition_to_clean: "202405'; DROP TABLE scores; --",
        },
        {
          database: "default",
          clusterEnabled: false,
        },
      ),
    ).toThrow("Invalid ClickHouse month partition");
    expect(() => buildMutationCountQuery(true, "")).toThrow(
      "Invalid ClickHouse cluster",
    );
  });
});

describe.sequential("DeletedMaskCleaner integration", () => {
  const cleanupPartitions = new Set<string>();

  beforeEach(async () => {
    await redis?.del(DELETED_MASK_CLEANER_LOCK_KEY);
  }, 30_000);

  afterEach(async () => {
    await redis?.del(DELETED_MASK_CLEANER_LOCK_KEY);
    for (const partition of cleanupPartitions) {
      if (await hasActivePatchPart(partition)) {
        await applyDeletedMask({
          partition: `patch-cleanup-${partition}`,
          table: TEST_TABLE,
          partition_to_clean: partition,
          total_rows: 0,
        });
      }
    }
    cleanupPartitions.clear();
  }, 150_000);

  it("applies a deleted mask for a real events patch partition", async (ctx) => {
    await skipUnlessEventsTableEnabled(ctx);

    const partitionToClean = getRandomPastMonthPartition();
    cleanupPartitions.add(partitionToClean);

    // Other test files leave patch partitions behind, and the cleaner picks
    // the largest one per table, so out-size them instead of trying to clean
    // them up here.
    const rows = Math.max(256, (await largestCandidateRows()) + 1);
    const projectId = await createEventPatchParts([
      {
        partition: partitionToClean,
        timestamp: getTimestampForMonthPartition(partitionToClean),
        rows,
      },
    ]);

    await expect(hasActivePatchPart(partitionToClean)).resolves.toBe(true);
    await expect(countPhysicalRows(projectId)).resolves.toBe(rows);

    const cleaner = new DeletedMaskCleaner();
    await eventually(
      async () => {
        await cleaner.processBatch();
        await waitForNoActiveMutations();
        return countPhysicalRows(projectId);
      },
      (remaining) => remaining === 0,
      `Timed out waiting for the cleaner to materialise the deletion in partition ${partitionToClean}`,
      PATCH_CLEAN_TIMEOUT_MS,
    );
    await waitForDeletionMaterialised(projectId);
    expect(await redis?.get(DELETED_MASK_CLEANER_LOCK_KEY)).toBeNull();
  }, 240_000);
});
