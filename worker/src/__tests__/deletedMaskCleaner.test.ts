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
  DELETED_MASK_CLEANER_TABLES,
  DELETED_MASK_CLEANER_WORK_QUERY,
  normalizeMutationCounts,
  selectCandidateToProcess,
  shouldUseDeletedMaskCleanerClusterMode,
  type MutationCountRow,
  type WorkCandidateRow,
} from "../features/deleted-mask-cleaner/helpers";

const TEST_TABLE = "events_full" as const;
const PATCH_WAIT_TIMEOUT_MS = 30_000;

interface TableExistsRow {
  count: number | string;
}

let eventsTableEnabled: boolean | undefined;

async function isEventsTableEnabled(): Promise<boolean> {
  if (eventsTableEnabled !== undefined) {
    return eventsTableEnabled;
  }
  try {
    const rows = await queryClickhouse<TableExistsRow>({
      query: `
        SELECT count() AS count
        FROM system.tables
        WHERE database = {database: String}
          AND name = {table: String}
      `,
      params: {
        database: env.CLICKHOUSE_DB,
        table: TEST_TABLE,
      },
    });
    eventsTableEnabled = Number(rows[0]?.count ?? 0) > 0;
  } catch {
    eventsTableEnabled = false;
  }

  return eventsTableEnabled;
}

async function skipUnlessEventsTableEnabled(ctx: TestContext): Promise<void> {
  if (!(await isEventsTableEnabled())) {
    ctx.skip("events table is not enabled in this ClickHouse");
  }

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
): Promise<T> {
  const deadline = Date.now() + PATCH_WAIT_TIMEOUT_MS;
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

async function hasCleanerCandidate(partitionToClean: string): Promise<boolean> {
  const rows = await queryClickhouse<WorkCandidateRow>({
    query: DELETED_MASK_CLEANER_WORK_QUERY,
    params: {
      database: env.CLICKHOUSE_DB,
      tables: Array.from(DELETED_MASK_CLEANER_TABLES),
    },
  });

  return rows.some(
    (row) =>
      row.table === TEST_TABLE && row.partition_to_clean === partitionToClean,
  );
}

async function waitForCleanerCandidate(
  partitionToClean: string,
): Promise<void> {
  await eventually(
    () => hasCleanerCandidate(partitionToClean),
    (hasCandidate) => hasCandidate,
    `Timed out waiting for ClickHouse patch part ${partitionToClean}`,
  );
}

async function waitForCleanerCandidateGone(
  partitionToClean: string,
): Promise<void> {
  await eventually(
    () => hasCleanerCandidate(partitionToClean),
    (hasCandidate) => !hasCandidate,
    `Timed out waiting for ClickHouse patch part ${partitionToClean} to be cleaned`,
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

async function waitForNoActiveMutations(): Promise<void> {
  await eventually(
    () => getActiveMutationCount(TEST_TABLE),
    (mutationCount) => mutationCount === 0,
    "Timed out waiting for ClickHouse mutations to finish",
  );
}

async function applyDeletedMaskIfNeeded(
  partitionToClean: string,
): Promise<void> {
  if (!(await hasCleanerCandidate(partitionToClean))) {
    return;
  }

  await commandClickhouse({
    query: buildApplyDeletedMaskQuery(
      {
        partition: `patch-cleanup-${partitionToClean}`,
        table: TEST_TABLE,
        partition_to_clean: partitionToClean,
        total_rows: 0,
      },
      {
        database: env.CLICKHOUSE_DB,
        clusterEnabled: shouldUseDeletedMaskCleanerClusterMode({
          clusterEnabled: env.CLICKHOUSE_CLUSTER_ENABLED === "true",
          cleanerClusterModeEnabled:
            env.LANGFUSE_CLICKHOUSE_DELETED_MASK_CLEANER_CLUSTER_MODE_ENABLED ===
            "true",
        }),
        clusterName: env.CLICKHOUSE_CLUSTER_NAME,
      },
    ),
  });

  await waitForNoActiveMutations();
  await waitForCleanerCandidateGone(partitionToClean);
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
          start_time: timestamp * 1000,
          end_time: timestamp * 1000,
          created_at: timestamp * 1000,
          updated_at: timestamp * 1000,
          event_ts: timestamp * 1000,
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
      await applyDeletedMaskIfNeeded(partition);
    }
    cleanupPartitions.clear();
  }, 90_000);

  it("applies a deleted mask for a real events patch partition", async (ctx) => {
    await skipUnlessEventsTableEnabled(ctx);

    const partitionToClean = getRandomPastMonthPartition();
    cleanupPartitions.add(partitionToClean);

    await createEventPatchParts([
      {
        partition: partitionToClean,
        timestamp: getTimestampForMonthPartition(partitionToClean),
        rows: 256,
      },
    ]);

    await expect(hasCleanerCandidate(partitionToClean)).resolves.toBe(true);

    const cleaner = new DeletedMaskCleaner();
    await cleaner.processBatch();

    await waitForNoActiveMutations();
    await waitForCleanerCandidateGone(partitionToClean);
    expect(await redis?.get(DELETED_MASK_CLEANER_LOCK_KEY)).toBeNull();
  }, 90_000);
});
